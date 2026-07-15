import { createHash } from 'node:crypto';
import { Factura, unidadEfectiva, mesDesdeFecha, esFechaFacturaValida } from '../models/Factura.js';
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

const UNIDADES_CLASIFICABLES = new Set(['Consulting', 'Technologies', 'Grupo']);

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

/** Asigna unidad de negocio a una factura concreta (no afecta al resto del cliente). */
export async function clasificarFactura(id, unidad) {
  if (!UNIDADES_CLASIFICABLES.has(unidad)) {
    throw new Error('Unidad inválida. Use Consulting, Technologies o Grupo.');
  }
  const factura = await Factura.findById(id);
  if (!factura) return null;
  factura.unidad = unidad;
  factura.unidadManual = true;
  factura.clasificacionAuto = false;
  await factura.save();
  return factura;
}

/** Re-aplica el mapa de clientes a facturas no marcadas como manuales. */
export async function reclasificarFacturasDesdeMapa() {
  const indice = await construirIndiceMapa();
  const facturas = await Factura.find({ unidadManual: { $ne: true } }).select('_id cliente').lean();
  let actualizadas = 0;
  for (const f of facturas) {
    const { unidad, clasificacionAuto } = clasificarPorCliente(f.cliente, indice);
    await Factura.updateOne({ _id: f._id }, { $set: { unidad, clasificacionAuto } });
    actualizadas += 1;
  }
  return { actualizadas, total: facturas.length };
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
export function rangoMesUtc(yyyyMm) {
  const [year, month] = String(yyyyMm ?? '').split('-').map(Number);
  if (!year || !month) return null;
  return {
    $gte: new Date(Date.UTC(year, month - 1, 1)),
    $lt: new Date(Date.UTC(year, month, 1)),
  };
}

export function construirFiltroFacturas(query = {}) {
  const {
    mes,
    mesFacturacion,
    mesPago,
    unidad,
    areaVenta,
    cliente,
    estatusPago,
    sinClasificar,
    totalMin,
    totalMax,
    q,
  } = query;

  const filtro = {};

  const mesF = mesFacturacion || mes;
  if (mesF) filtro.mes = mesF;

  if (mesPago) {
    const rango = rangoMesUtc(mesPago);
    if (rango) filtro.fechaPago = rango;
  }

  if (estatusPago) {
    const enumVal = normalizarEstatusPago(estatusPago);
    if (enumVal) filtro.estatusPago = enumVal;
  }

  const area = areaVenta || unidad;
  if (area) {
    if (area === 'Consulting' || area === 'Strategy') {
      filtro.unidad = { $in: ['Consulting', 'Strategy'] };
    } else {
      filtro.unidad = area;
    }
  }

  if (sinClasificar === 'true' || sinClasificar === true) {
    filtro.unidad = null;
  }

  if (cliente) filtro.cliente = cliente;

  if (totalMin || totalMax) {
    filtro.total = {};
    if (totalMin) filtro.total.$gte = Number(totalMin);
    if (totalMax) filtro.total.$lte = Number(totalMax);
  }

  if (q) {
    const rx = { $regex: escaparRegex(q), $options: 'i' };
    filtro.$or = [{ cliente: rx }, { concepto: rx }, { noFactura: rx }];
  }

  return filtro;
}

export function construirFiltroFacturasMongo(query = {}) {
  return construirFiltroFacturas(query);
}

// ---- Totales (respeta los mismos filtros que el listado) ----
export async function totalesFacturas(filtros = {}) {
  const base = construirFiltroFacturas(filtros);
  const match = {
    ...base,
    estatusEnvio: { $ne: 'CANCELADA' },
  };
  if (!base.estatusPago) {
    match.estatusPago = { $ne: 'CANCELADO' };
  }

  const facturas = await Factura.find(match).select('unidad total estatusPago').lean();

  const porUnidad = { Consulting: 0, Technologies: 0, Grupo: 0, sin_clasificar: 0 };
  let facturado = 0;
  let pagado = 0;
  let cantidadPagadas = 0;
  let cantidadPendientes = 0;

  for (const f of facturas) {
    const monto = Number(f.total) || 0;
    facturado += monto;
    if (f.estatusPago === 'PAGADO') {
      pagado += monto;
      cantidadPagadas += 1;
    } else {
      cantidadPendientes += 1;
    }
    const u = unidadEfectiva(f.unidad);
    porUnidad[u] = (porUnidad[u] || 0) + monto;
  }

  for (const k of Object.keys(porUnidad)) porUnidad[k] = redondear(porUnidad[k]);

  return {
    facturado: redondear(facturado),
    pagado: redondear(pagado),
    pendiente: redondear(facturado - pagado),
    porUnidad,
    facturas: facturas.length,
    cantidadPagadas,
    cantidadPendientes,
  };
}

export async function mesesFacturacionDisponibles() {
  const meses = await Factura.distinct('mes');
  return meses.filter((m) => m && m >= '2000-01').sort((a, b) => b.localeCompare(a));
}

export async function mesesPagoDisponibles() {
  const resultado = await Factura.aggregate([
    { $match: { fechaPago: { $ne: null, $gte: new Date('2000-01-01T00:00:00.000Z') } } },
    { $project: { mes: { $dateToString: { format: '%Y-%m', date: '$fechaPago' } } } },
    { $group: { _id: '$mes' } },
    { $match: { _id: { $gte: '2000-01' } } },
    { $sort: { _id: -1 } },
  ]);
  return resultado.map((m) => m._id).filter(Boolean);
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

  const texto = String(valor).trim();
  const mesesAbrev = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  };
  const match = texto.match(/^(\d{1,2})-([A-Za-zÁ-ú]{3})-(\d{2,4})$/);
  if (match) {
    const dia = Number(match[1]);
    const mes = mesesAbrev[match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3)];
    let anio = Number(match[3]);
    if (anio < 100) anio += 2000;
    if (mes !== undefined && dia > 0) return new Date(Date.UTC(anio, mes, dia));
  }

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

  // Limpia registros con fecha placeholder (epoch 1970) de migraciones anteriores.
  if (!dryRun) {
    await Factura.deleteMany({ fechaFacturacion: { $lt: new Date('2000-01-01T00:00:00.000Z') } });
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
    omitidasSinFecha: 0,
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

    const fechaPagoParsed = aFecha(val(fila, 'fechaPago'));
    let fechaFacturacion =
      aFecha(val(fila, 'fechaFacturacion')) || aFecha(val(fila, 'fechaMovimiento'));
    // Sin fecha de facturación en Excel → usar fecha de pago si existe (evita epoch 1970).
    if (!esFechaFacturaValida(fechaFacturacion) && esFechaFacturaValida(fechaPagoParsed)) {
      fechaFacturacion = fechaPagoParsed;
    }
    if (!esFechaFacturaValida(fechaFacturacion)) {
      if (resumen.alertas.sinFecha.length < 20) {
        resumen.alertas.sinFecha.push({
          noFactura: String(val(fila, 'noFactura') ?? '').trim() || '(sin folio)',
          cliente: cliente || 'Sin cliente',
        });
      }
      resumen.omitidasSinFecha += 1;
      continue;
    }

    const subtotal = parsearNumero(val(fila, 'subtotal')) ?? 0;
    const iva = parsearNumero(val(fila, 'iva')) ?? 0;
    const total = parsearNumero(val(fila, 'total')) ?? redondear(subtotal + iva);
    const concepto = String(val(fila, 'conceptoFactura') ?? val(fila, 'conceptoMovimiento') ?? '').trim();

    const noFacturaRaw = String(val(fila, 'noFactura') ?? '').trim();
    const noFactura =
      noFacturaRaw ||
      folioSintetico(cliente, fechaFacturacion.toISOString(), total, concepto);

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
    if (totalFinal === 0) {
      if (resumen.alertas.totalCero.length < 20) {
        resumen.alertas.totalCero.push({ noFactura, cliente: cliente || 'Sin cliente' });
      }
    }

    const doc = {
      fechaFacturacion,
      mes: mesDesdeFecha(fechaFacturacion),
      fechaPago: esFechaFacturaValida(fechaPagoParsed) ? fechaPagoParsed : null,
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
      const existente = await Factura.findOne({ noFactura }).select('unidadManual').lean();
      if (existente?.unidadManual) {
        const { unidad: _u, clasificacionAuto: _c, ...docSinClasif } = doc;
        await Factura.findOneAndUpdate({ noFactura }, docSinClasif, {
          new: true,
          runValidators: true,
        });
      } else {
        await Factura.findOneAndUpdate({ noFactura }, doc, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        });
      }
    }
    resumen.migradas += 1;
  }

  resumen.ok = true;
  return resumen;
}
