import { createHash } from 'node:crypto';
import { Factura, unidadEfectiva, mesDesdeFecha } from '../models/Factura.js';
import { ExcelImport } from '../models/ExcelImport.js';
import { MapaUnidad } from '../models/MapaUnidad.js';
import {
  normalizarClave,
  normalizarUnidad,
  crearIndiceMapaUnidades,
  esRegistroCancelado,
} from '../utils/clasificacionMotor.js';
import { asegurarMapaUnidadesDisponible } from './mapaSync.js';
import { detectarColumnas, parsearNumero } from '../utils/excelFiltros.js';

const redondear = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function normalizarRfcEmisor(valor) {
  const v = String(valor ?? '').trim().toUpperCase();
  if (v === 'GAVM') return 'GAVM';
  if (v === 'GBL' || v.startsWith('GBL')) return 'GBL';
  return v ? 'OTRO' : 'GBL';
}

// Strategy (legacy) → Consulting al persistir. Valores fuera del enum → null.
function unidadValidaParaFactura(unidad) {
  if (!unidad) return null;
  const u = normalizarUnidad(unidad);
  if (u === 'Consulting' || u === 'Technologies' || u === 'Grupo') return u;
  if (u === 'Strategy') return 'Consulting';
  return null;
}

function unidadDesdeMigracion(unidadMapa, areaVentaExcel) {
  const desdeMapa = unidadValidaParaFactura(unidadMapa);
  if (desdeMapa) return desdeMapa;
  return unidadValidaParaFactura(areaVentaExcel);
}

// IVA: 16% salvo excepción NOVAMEX (factura USD) → IVA 0.
export function calcularIva(subtotal, cliente) {
  const base = Number(subtotal) || 0;
  if (/novamex/i.test(cliente ?? '')) return 0;
  return redondear(base * 0.16);
}

const escaparRegex = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- Clasificación por cliente contra el Mapa de Unidades ----
export async function construirIndiceMapa() {
  await asegurarMapaUnidadesDisponible();
  const entradas = await MapaUnidad.find().lean();
  return crearIndiceMapaUnidades(entradas);
}

export function clasificarPorCliente(cliente, indice) {
  const nombre = String(cliente ?? '').trim();
  if (!nombre) return { unidad: null, clasificacionAuto: false };
  const entrada = indice.get(normalizarClave(nombre));
  if (!entrada) return { unidad: null, clasificacionAuto: false };
  return { unidad: normalizarUnidad(entrada.unidad), clasificacionAuto: true };
}

// ---- Normalización de estatus (texto libre del Excel → enum) ----
export function normalizarEstatusPago(valor) {
  const n = normalizarClave(valor);
  if (!n) return undefined;
  if (n.includes('cancelad')) return 'CANCELADO';
  if (n.includes('parcial')) return 'PARCIAL';
  if (n.includes('vencid')) return 'VENCIDO';
  if (n.includes('pagad')) return 'PAGADO';
  if (n.includes('pendiente') || n.includes('por pagar')) return 'PENDIENTE';
  return undefined;
}

export function normalizarEstatusEnvio(valor) {
  const n = normalizarClave(valor);
  if (!n) return undefined;
  if (n.includes('cancelad')) return 'CANCELADA';
  if (n.includes('enviad')) return 'ENVIADA';
  if (n.includes('por enviar') || n.includes('pendiente')) return 'POR_ENVIAR';
  return undefined;
}

// ---- Filtros de listado ----
export function construirFiltroFacturas({ mes, unidad, cliente, estatusPago, sinClasificar, q } = {}) {
  const filtro = {};
  if (mes) filtro.mes = mes;
  if (estatusPago) filtro.estatusPago = estatusPago;
  if (cliente) filtro.cliente = { $regex: escaparRegex(cliente), $options: 'i' };

  if (unidad) {
    // "Consulting" incluye la unidad legacy "Strategy".
    filtro.unidad = unidad === 'Consulting' ? { $in: ['Consulting', 'Strategy'] } : unidad;
  }

  if (sinClasificar === 'true' || sinClasificar === true) {
    filtro.unidad = null;
  }

  if (q) {
    const rx = { $regex: escaparRegex(q), $options: 'i' };
    filtro.$or = [{ cliente: rx }, { concepto: rx }, { noFactura: rx }];
  }

  return filtro;
}

// ---- Totales por mes ----
export async function totalesFacturas(mes) {
  const match = {
    estatusPago: { $ne: 'CANCELADO' },
    estatusEnvio: { $ne: 'CANCELADA' },
  };
  if (mes) match.mes = mes;

  const facturas = await Factura.find(match).select('unidad total estatusPago').lean();

  const porUnidad = { Consulting: 0, Technologies: 0, Grupo: 0, sin_clasificar: 0 };
  let facturado = 0;
  let pagado = 0;

  for (const f of facturas) {
    const monto = Number(f.total) || 0;
    facturado += monto;
    if (f.estatusPago === 'PAGADO') pagado += monto;
    const u = unidadEfectiva(f.unidad);
    porUnidad[u] = (porUnidad[u] || 0) + monto;
  }

  for (const k of Object.keys(porUnidad)) porUnidad[k] = redondear(porUnidad[k]);

  return {
    facturado: redondear(facturado),
    pagado: redondear(pagado),
    pendiente: redondear(facturado - pagado),
    porUnidad,
  };
}

export async function clientesDistintos() {
  const [deFacturas, delMapa] = await Promise.all([
    Factura.distinct('cliente'),
    MapaUnidad.distinct('clienteRazonSocial'),
  ]);
  const set = new Set([...deFacturas, ...delMapa].filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

// Genera un folio sintético estable para filas sin noFactura (idempotente).
function folioSintetico(cliente, fecha, total, concepto) {
  const semilla = `${normalizarClave(cliente)}|${fecha ?? ''}|${total ?? ''}|${normalizarClave(concepto)}`;
  return 'S/F-' + createHash('md5').update(semilla).digest('hex').slice(0, 12);
}

function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- Migración desde la última importación de facturación (ExcelImport) ----
// NO borra ExcelImport. Idempotente: hace upsert por noFactura.
export async function migrarFacturasDesdeExcel({ dryRun = false } = {}) {
  const importacion = await ExcelImport.findOne({ tipoHoja: 'facturacion' })
    .sort({ createdAt: -1 })
    .lean();

  if (!importacion) {
    return { ok: false, error: 'No hay ninguna importación de tipo "facturacion" en ExcelImport.' };
  }

  const mapeo = detectarColumnas(importacion.columnas ?? []);
  const indice = await construirIndiceMapa();
  const columnaMonto = mapeo.total || mapeo.subtotal;

  const resumen = {
    origenImport: {
      id: String(importacion._id),
      nombreArchivo: importacion.nombreArchivo,
      nombreHoja: importacion.nombreHoja,
      totalFilas: importacion.filas?.length ?? 0,
      createdAt: importacion.createdAt,
    },
    procesadas: 0,
    migradas: 0,
    sinClasificar: 0,
    canceladas: 0,
    duplicadosEnFuente: 0,
    omitidasSinDatos: 0,
    porUnidad: { Consulting: 0, Technologies: 0, Grupo: 0, sin_clasificar: 0 },
    alertas: {
      totalCero: [],
      sinCliente: [],
      sinFecha: [],
    },
    duplicados: [],
    dryRun,
  };

  const foliosVistos = new Set();
  const val = (fila, campo) => (mapeo[campo] ? fila[mapeo[campo]] : undefined);

  for (const fila of importacion.filas ?? []) {
    const cliente = String(val(fila, 'cliente') ?? '').trim();
    const monto = parsearNumero(val(fila, columnaMonto));

    if (!cliente && monto === null) {
      resumen.omitidasSinDatos += 1;
      continue;
    }

    resumen.procesadas += 1;

    const fecha = aFecha(val(fila, 'fechaFacturacion')) || aFecha(val(fila, 'fechaMovimiento'));
    const subtotal = parsearNumero(val(fila, 'subtotal')) ?? 0;
    const iva = parsearNumero(val(fila, 'iva')) ?? 0;
    const total = parsearNumero(val(fila, 'total')) ?? redondear(subtotal + iva);
    const concepto = String(val(fila, 'conceptoFactura') ?? val(fila, 'conceptoMovimiento') ?? '').trim();

    const noFacturaRaw = String(val(fila, 'noFactura') ?? '').trim();
    const noFactura = noFacturaRaw || folioSintetico(cliente, fecha?.toISOString(), total, concepto);

    if (foliosVistos.has(noFactura)) {
      resumen.duplicadosEnFuente += 1;
      if (resumen.duplicados.length < 50) {
        resumen.duplicados.push({ noFactura, cliente });
      }
      continue;
    }
    foliosVistos.add(noFactura);

    const cancelada = esRegistroCancelado(fila, mapeo);
    const areaVentaExcel = String(val(fila, 'areaVenta') ?? '').trim();
    const { unidad: unidadMapa, clasificacionAuto: autoMapa } = clasificarPorCliente(cliente, indice);
    const unidad = unidadDesdeMigracion(unidadMapa, areaVentaExcel);
    const clasificacionAuto = autoMapa && unidad !== null;
    const unidadEfectivaConteo = unidadEfectiva(unidad);
    resumen.porUnidad[unidadEfectivaConteo] = (resumen.porUnidad[unidadEfectivaConteo] || 0) + 1;
    if (!unidad) resumen.sinClasificar += 1;
    if (cancelada) resumen.canceladas += 1;

    const ivaFinal = /novamex/i.test(cliente) ? 0 : redondear(iva ?? calcularIva(subtotal, cliente));
    const totalFinal =
      /novamex/i.test(cliente) ? redondear(subtotal) : redondear(total ?? subtotal + ivaFinal);

    if (!cliente) {
      if (resumen.alertas.sinCliente.length < 20) {
        resumen.alertas.sinCliente.push({ noFactura, total: totalFinal });
      }
    }
    if (!fecha) {
      if (resumen.alertas.sinFecha.length < 20) {
        resumen.alertas.sinFecha.push({ noFactura, cliente: cliente || 'Sin cliente' });
      }
    }
    if (totalFinal === 0) {
      if (resumen.alertas.totalCero.length < 20) {
        resumen.alertas.totalCero.push({ noFactura, cliente: cliente || 'Sin cliente' });
      }
    }

    const fechaFacturacion = fecha || new Date(0);
    const doc = {
      fechaFacturacion,
      // findOneAndUpdate no dispara el hook pre('validate'), así que calculamos mes aquí.
      mes: mesDesdeFecha(fechaFacturacion),
      fechaPago: aFecha(val(fila, 'fechaPago')),
      noFactura,
      cliente: cliente || 'Sin cliente',
      concepto,
      unidad,
      subtotal: redondear(subtotal),
      iva: ivaFinal,
      total: totalFinal,
      estatusEnvio: cancelada ? 'CANCELADA' : normalizarEstatusEnvio(val(fila, 'estatusEnvio')),
      estatusPago: cancelada ? 'CANCELADO' : normalizarEstatusPago(val(fila, 'estatusPago')),
      rfcEmisor: normalizarRfcEmisor(val(fila, 'rfcEmisor')),
      clasificacionAuto,
      origen: 'excel-migracion',
    };

    if (!dryRun) {
      await Factura.findOneAndUpdate({ noFactura }, doc, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      });
    }
    resumen.migradas += 1;
  }

  resumen.ok = true;
  return resumen;
}
