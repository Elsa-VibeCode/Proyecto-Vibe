#!/usr/bin/env node
/**
 * Sincroniza estatusPago de facturas PPD con complementos de pago registrados.
 *
 * Regla:
 *   - Con complemento (REP) en AdminSys → PAGADO o PARCIAL + fechaPago del complemento
 *   - Sin complemento → PENDIENTE (limpia fechaPago)
 *
 * Uso:
 *   npm run sync:estatus-complementos -- --dry-run
 *   npm run sync:estatus-complementos -- --mes=2026-07
 *   npm run sync:estatus-complementos -- --mes=2026-07 --dry-run
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Factura } from '../src/models/Factura.js';
import { ComplementoPago } from '../src/models/ComplementoPago.js';
import { recalcularFacturaComplementos } from '../src/services/complementoPagoService.js';
import { invalidarPanelCompleto } from '../src/services/panel/invalidarPanel.js';

const dryRun = process.argv.includes('--dry-run');
const mesArg = process.argv.find((a) => a.startsWith('--mes='));
const mesFiltro = mesArg ? mesArg.split('=')[1] : null;

function redondear(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function construirIndiceComplementos() {
  const indice = new Map();
  const complementos = await ComplementoPago.find().lean();

  for (const comp of complementos) {
    for (const rel of comp.facturasRelacionadas ?? []) {
      const id = String(rel.facturaId);
      if (!indice.has(id)) {
        indice.set(id, { montoPagado: 0, fechaPago: null, complementoIds: [] });
      }
      const entry = indice.get(id);
      entry.montoPagado += Number(rel.importePagado) || 0;
      entry.complementoIds.push(comp._id);
      const fp = comp.fechaPago ? new Date(comp.fechaPago) : null;
      if (fp && (!entry.fechaPago || fp > entry.fechaPago)) {
        entry.fechaPago = fp;
      }
    }
  }

  for (const entry of indice.values()) {
    entry.montoPagado = redondear(entry.montoPagado);
  }

  return indice;
}

function estatusDesdeMonto(total, pagado) {
  const saldo = redondear(total - pagado);
  if (pagado <= 0) return 'PENDIENTE';
  if (saldo <= 0.01) return 'PAGADO';
  return 'PARCIAL';
}

export async function sincronizarEstatusPagoComplementos({ mes = null, dryRun: simular = false } = {}) {
  const indice = await construirIndiceComplementos();
  const filtro = {
    deletedAt: null,
    metodoPago: 'PPD',
    estatusEnvio: { $ne: 'CANCELADA' },
  };
  if (mes) filtro.mes = mes;

  const facturas = await Factura.find(filtro).sort({ noFactura: 1 });
  const resumen = {
    revisadas: facturas.length,
    aPendiente: [],
    aPagado: [],
    aParcial: [],
    sinCambio: 0,
  };

  for (const factura of facturas) {
    const comp = indice.get(String(factura._id));
    const tieneComp = comp && comp.montoPagado > 0;
    let nuevoEstatus;
    let nuevaFecha = null;

    if (tieneComp) {
      nuevoEstatus = estatusDesdeMonto(factura.total, comp.montoPagado);
      nuevaFecha = comp.fechaPago;
    } else {
      nuevoEstatus = 'PENDIENTE';
      nuevaFecha = null;
    }

    const fechaActual = factura.fechaPago
      ? new Date(factura.fechaPago).toISOString().slice(0, 10)
      : null;
    const fechaNueva = nuevaFecha ? nuevaFecha.toISOString().slice(0, 10) : null;
    const cambio =
      factura.estatusPago !== nuevoEstatus ||
      fechaActual !== fechaNueva ||
      (tieneComp && Math.abs((factura.montoPagado || 0) - comp.montoPagado) > 0.01) ||
      (!tieneComp && (factura.montoPagado || 0) > 0);

    if (!cambio) {
      resumen.sinCambio += 1;
      continue;
    }

    const registro = {
      noFactura: factura.noFactura,
      cliente: factura.cliente,
      mes: factura.mes,
      antes: factura.estatusPago,
      despues: nuevoEstatus,
      fechaAntes: fechaActual,
      fechaDespues: fechaNueva,
    };

    if (nuevoEstatus === 'PENDIENTE') resumen.aPendiente.push(registro);
    else if (nuevoEstatus === 'PARCIAL') resumen.aParcial.push(registro);
    else resumen.aPagado.push(registro);

    if (!simular) {
      factura.estatusPago = nuevoEstatus;
      factura.fechaPago = nuevaFecha;
      if (!tieneComp) {
        factura.montoPagado = 0;
        factura.complementosEmitidos = [];
      }
      await factura.save();
      if (tieneComp) {
        await recalcularFacturaComplementos(factura._id);
      }
    }
  }

  return resumen;
}

async function main() {
  await connectDB();
  console.log(dryRun ? '=== DRY RUN sync estatusPago ↔ complementos ===' : '=== Sync estatusPago ↔ complementos ===');
  if (mesFiltro) console.log(`Filtro mes: ${mesFiltro}`);

  const resumen = await sincronizarEstatusPagoComplementos({ mes: mesFiltro, dryRun });

  console.log(`\nFacturas PPD revisadas: ${resumen.revisadas}`);
  console.log(`Sin cambio: ${resumen.sinCambio}`);
  console.log(`→ PENDIENTE (sin complemento): ${resumen.aPendiente.length}`);
  console.log(`→ PAGADO (con complemento): ${resumen.aPagado.length}`);
  console.log(`→ PARCIAL (con complemento): ${resumen.aParcial.length}`);

  if (resumen.aPendiente.length) {
    console.log('\n--- Pasan a PENDIENTE ---');
    for (const r of resumen.aPendiente) {
      console.log(`  ${r.noFactura} · ${r.cliente} · ${r.mes} · ${r.antes} (${r.fechaAntes ?? '—'}) → PENDIENTE`);
    }
  }

  if (resumen.aPagado.length) {
    console.log('\n--- Pasan a PAGADO ---');
    for (const r of resumen.aPagado.slice(0, 15)) {
      console.log(`  ${r.noFactura} · ${r.cliente} · ${r.fechaDespues ?? '—'}`);
    }
    if (resumen.aPagado.length > 15) {
      console.log(`  ... y ${resumen.aPagado.length - 15} más`);
    }
  }

  if (!dryRun && (resumen.aPendiente.length || resumen.aPagado.length || resumen.aParcial.length)) {
    invalidarPanelCompleto();
    console.log('\nPanel cache invalidado.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
