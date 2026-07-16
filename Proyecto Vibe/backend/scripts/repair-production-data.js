/**
 * Repara datos de producción en MongoDB Atlas:
 * 1. Corrige egresos con mes 1970-01 (fechas corruptas al importar)
 * 2. Siembra egresos recurrentes de julio 2026 (Grupo)
 * 3. Backfill fechaPago para vista Cobro del Panel
 *
 * Uso: node --env-file=.env scripts/repair-production-data.js [--dry-run]
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Egreso, calcularMontos } from '../src/models/Egreso.js';
import { Factura } from '../src/models/Factura.js';
import { EgresoRecurrente } from '../src/models/EgresoRecurrente.js';
import { ExcelImport } from '../src/models/ExcelImport.js';
import { detectarColumnas } from '../src/utils/excelFiltros.js';
import { invalidarPanelCompleto } from '../src/services/panel/invalidarPanel.js';

const dryRun = process.argv.includes('--dry-run');

function parseFechaTexto(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mesDesdeFecha(fecha) {
  if (!fecha) return '';
  return fecha.toISOString().slice(0, 7);
}

async function repararEgresosCorruptos() {
  const cap = await ExcelImport.findOne({
    nombreHoja: 'Captura Egresos',
    nombreArchivo: /v33/,
  })
    .sort({ createdAt: -1 })
    .lean();

  const porFactura = new Map();
  for (const fila of cap?.filas ?? []) {
    const noFactura = String(fila['No.Factura'] ?? fila['No.Factura'] ?? '').trim();
    if (noFactura) porFactura.set(noFactura, fila);
  }

  const corruptos = await Egreso.find({ mes: '1970-01' }).lean();
  let fixed = 0;

  for (const eg of corruptos) {
    const fila = porFactura.get(eg.noFactura);
    const fechaGasto = parseFechaTexto(fila?.['Fecha Gasto']);
    if (!fechaGasto) {
      console.warn(`  ⚠ Sin fecha Excel para ${eg.noFactura}, omitido`);
      continue;
    }
    const mes = mesDesdeFecha(fechaGasto);
    const subtotal = Number(eg.subtotal) || 0;
    const tipoImpuesto = eg.tipoImpuesto || 'IVA_16';
    const montos = calcularMontos({ subtotal, tipoImpuesto });

    const update = {
      fechaGasto,
      mes,
      subtotal,
      impuesto: montos.impuesto,
      total: montos.total,
    };

    console.log(`  ✓ Egreso ${eg.noFactura}: ${eg.mes} → ${mes} (${fechaGasto.toISOString().slice(0, 10)})`);
    if (!dryRun) {
      await Egreso.updateOne({ _id: eg._id }, { $set: update });
    }
    fixed += 1;
  }

  return fixed;
}

async function sembrarEgresosJulio2026() {
  const mes = '2026-07';
  const recurrentes = await EgresoRecurrente.find({ activo: true }).lean();
  let creados = 0;
  let omitidos = 0;

  for (const rec of recurrentes) {
    const existe = await Egreso.findOne({
      mes,
      tipoGasto: rec.tipoGasto,
      proveedor: { $regex: rec.proveedorEsperado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
    }).lean();

    if (existe) {
      omitidos += 1;
      continue;
    }

    const dia = rec.diaEsperado ?? 15;
    const fechaGasto = new Date(Date.UTC(2026, 6, dia, 12, 0, 0));
    const subtotal = rec.montoReferencia ?? 0;
    const tipoImpuesto = subtotal > 0 && rec.tipoGasto.includes('IMPUESTOS') ? 'CERO' : 'IVA_16';
    const montos = calcularMontos({ subtotal, tipoImpuesto: tipoImpuesto === 'CERO' ? 'CERO' : 'IVA_16' });
    const total = rec.montoReferencia ?? montos.total;

    const doc = {
      fechaGasto,
      mes,
      proyecto: rec.unidad === 'Grupo' ? 'GRUPO' : rec.unidad.toUpperCase(),
      estadoResultado: 'ADMINISTRATIVO',
      unidad: rec.unidad,
      tipoGasto: rec.tipoGasto,
      tipoSubgasto: rec.proveedorEsperado,
      metodoPago: rec.tipoGasto === 'CREDITOS' ? 'DOMICILIACION' : 'TRANSFERENCIA',
      noFactura: `${rec.proveedorEsperado.slice(0, 8).toUpperCase()}-202607`,
      proveedor: rec.proveedorEsperado,
      concepto: rec.nombre,
      subtotal,
      tipoImpuesto: tipoImpuesto === 'CERO' ? 'CERO' : 'IVA_16',
      impuesto: tipoImpuesto === 'CERO' ? 0 : montos.impuesto,
      total,
      esTransferLatam: /LATAM/i.test(rec.nombre),
    };

    console.log(`  + Egreso julio: ${rec.nombre} → ${total.toFixed(2)}`);
    if (!dryRun) await Egreso.create(doc);
    creados += 1;
  }

  return { creados, omitidos };
}

async function backfillFechaPago() {
  const imp = await ExcelImport.findOne({
    nombreArchivo: /v33/,
    tipoHoja: 'facturacion',
  })
    .sort({ createdAt: -1 })
    .lean();

  const mapeo = detectarColumnas(imp?.columnas ?? []);
  const porFolio = new Map();

  for (const fila of imp?.filas ?? []) {
    const folio = String(fila[mapeo.noFactura] ?? '').trim();
    if (folio) porFolio.set(folio, fila);
  }

  // Cobradas en julio 2026: emitidas jul + arrastres jun (GBL-1100, 1105, 1121)
  const foliosCobroJulio = [
    'GBL-1100',
    'GBL-1105',
    'GBL-1121',
    'GBL-1147',
    'GBL-1148',
    'GBL-1149',
    'GBL-1150',
    'GBL-1151',
    'GBL-1152',
    'GBL-1153',
    'GBL-1154',
    'GBL-1155',
  ];

  const defaultCobroJulio = new Date(Date.UTC(2026, 6, 31, 12, 0, 0));
  let actualizadas = 0;

  for (const folio of foliosCobroJulio) {
    const factura = await Factura.findOne({ noFactura: folio, deletedAt: null }).lean();
    if (!factura) {
      console.warn(`  ⚠ Factura ${folio} no encontrada`);
      continue;
    }

    const fila = porFolio.get(folio);
    let fechaPago = parseFechaTexto(fila?.[mapeo.fechaPago]);
    if (!fechaPago && folio === 'GBL-1105') {
      fechaPago = parseFechaTexto('2026-07-02');
    }
    if (!fechaPago && foliosCobroJulio.includes(folio)) {
      fechaPago = defaultCobroJulio;
    }

    if (!fechaPago) continue;

    const mesPago = mesDesdeFecha(fechaPago);
    if (factura.fechaPago && factura.estatusPago === 'PAGADO') {
      continue;
    }

    console.log(`  ✓ ${folio}: fechaPago=${fechaPago.toISOString().slice(0, 10)} (mes cobro ${mesPago})`);
    if (!dryRun) {
      await Factura.updateOne(
        { _id: factura._id },
        { $set: { fechaPago, estatusPago: 'PAGADO' } }
      );
    }
    actualizadas += 1;
  }

  // PAGADO histórico sin fechaPago → fin del mes de facturación
  const sinFecha = await Factura.find({
    deletedAt: null,
    estatusPago: 'PAGADO',
    $or: [{ fechaPago: null }, { fechaPago: { $exists: false } }],
  }).lean();

  for (const f of sinFecha) {
    if (foliosCobroJulio.includes(f.noFactura)) continue;
    const [y, m] = (f.mes || '2020-01').split('-').map(Number);
    const fechaPago = new Date(Date.UTC(y, m, 0, 12, 0, 0)); // último día del mes
    console.log(`  ✓ ${f.noFactura}: backfill histórico → ${fechaPago.toISOString().slice(0, 10)}`);
    if (!dryRun) {
      await Factura.updateOne({ _id: f._id }, { $set: { fechaPago } });
    }
    actualizadas += 1;
  }

  return actualizadas;
}

async function main() {
  await connectDB();
  console.log(dryRun ? '=== DRY RUN ===' : '=== REPARACIÓN PRODUCCIÓN ===');

  console.log('\n1. Egresos corruptos (1970-01)');
  const egFixed = await repararEgresosCorruptos();
  console.log(`   ${egFixed} corregidos`);

  console.log('\n2. Egresos recurrentes julio 2026');
  const { creados, omitidos } = await sembrarEgresosJulio2026();
  console.log(`   ${creados} creados, ${omitidos} ya existían`);

  console.log('\n3. Backfill fechaPago (vista Cobro)');
  const facUpd = await backfillFechaPago();
  console.log(`   ${facUpd} facturas actualizadas`);

  if (!dryRun) invalidarPanelCompleto();

  // Resumen
  const julEg = await Egreso.countDocuments({ mes: '2026-07' });
  const { obtenerPanel } = await import('../src/services/panel/panelService.js');
  const panelCobro = await obtenerPanel('2026-07', { refrescar: true, vista: 'cobro' });
  const panelFact = await obtenerPanel('2026-07', { refrescar: true, vista: 'facturacion' });

  console.log('\n--- Resumen ---');
  console.log(`Egresos julio 2026: ${julEg}`);
  console.log(
    `Panel Cobro Consulting: ${panelCobro.unidades.consulting.facturado.toFixed(2)} (${panelCobro.unidades.consulting.numFacturas} facturas)`
  );
  console.log(
    `Panel Facturación Consulting: ${panelFact.unidades.consulting.facturado.toFixed(2)} (${panelFact.unidades.consulting.numFacturas} facturas)`
  );
  console.log(`Regla 10% cobro: ${panelCobro.regla10.aporteEsperado.toFixed(2)}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
