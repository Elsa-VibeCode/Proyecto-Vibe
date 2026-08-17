import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Factura, esFechaFacturaValida, mesDesdeFecha } from '../models/Factura.js';
import { ComplementoPago } from '../models/ComplementoPago.js';
import { ImportacionLog } from '../models/ImportacionLog.js';
import {
  FILTRO_ACTIVAS,
  clasificarPorCliente,
  construirIndiceMapa,
  historialCliente,
  normalizarMetodoPago,
  normalizarRfcEmisor,
  unidadValidaParaFactura,
} from './facturaService.js';
import { recalcularFacturasDeComplemento } from './complementoPagoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../uploads/cfdi-xml');
const BATCH_SIZE = 50;
const RFC_GBL = 'GBL200124HN4';
const RFC_GAVM = 'GAVM780815620';

const redondear = (v) => Math.round((Number(v) || 0) * 100) / 100;

function attrsDesdeApertura(fragmento) {
  const out = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(fragmento))) {
    const clave = m[1].includes(':') ? m[1].split(':').pop() : m[1];
    out[clave] = m[3]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  return out;
}

function encontrarTagAttrs(xml, localName) {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}\\b([^>]*)\\/?>`, 'i');
  const m = xml.match(re);
  return m ? attrsDesdeApertura(m[1]) : null;
}

function encontrarTodosTagAttrs(xml, localName) {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}\\b([^>]*)\\/?>`, 'gi');
  const lista = [];
  let m;
  while ((m = re.exec(xml))) {
    lista.push(attrsDesdeApertura(m[1]));
  }
  return lista;
}

function encontrarBloques(xml, localName) {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${localName}\\b([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>)`,
    'gi'
  );
  const lista = [];
  let m;
  while ((m = re.exec(xml))) {
    lista.push({ attrs: attrsDesdeApertura(m[1] || ''), inner: m[2] || '' });
  }
  return lista;
}

function formaPagoSat(valor) {
  const codigo = String(valor ?? '').trim().padStart(2, '0');
  return ['01', '02', '03', '04', '28', '99'].includes(codigo) ? codigo : '99';
}

function monedaComplemento(valor) {
  const m = String(valor ?? 'MXN').trim().toUpperCase();
  return ['MXN', 'USD', 'EUR'].includes(m) ? m : 'MXN';
}

function unidadComplemento(unidad) {
  if (unidad === 'Consulting' || unidad === 'Technologies' || unidad === 'Grupo') return unidad;
  if (unidad === 'Strategy') return 'Consulting';
  return 'Technologies';
}

function parsearNumeroCfdi(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(String(valor).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function fechaDesdeCfdi(fechaStr) {
  if (!fechaStr) return null;
  // CFDI: 2024-03-15T14:30:00
  const d = new Date(String(fechaStr).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function folioDesdeComprobante(comp) {
  const serie = String(comp.Serie ?? '').trim();
  const folio = String(comp.Folio ?? '').trim();
  if (serie && folio) return `${serie}-${folio}`;
  if (folio) return folio;
  if (serie) return serie;
  return '';
}

function rfcCodigoDesdeRfc(rfcRaw) {
  const rfc = String(rfcRaw ?? '').trim().toUpperCase();
  if (!rfc) return 'OTRO';
  if (rfc === RFC_GAVM || rfc.startsWith('GAVM')) return 'GAVM';
  if (rfc === RFC_GBL || rfc.startsWith('GBL')) return 'GBL';
  return normalizarRfcEmisor(rfc);
}

function conceptoDesdeXml(xml) {
  const conceptos = encontrarTodosTagAttrs(xml, 'Concepto');
  const textos = conceptos
    .map((c) => String(c.Descripcion ?? '').trim())
    .filter(Boolean);
  if (!textos.length) return 'Servicios profesionales';
  const unico = [...new Set(textos)];
  return unico.slice(0, 3).join(' · ').slice(0, 500);
}

function ivaDesdeXml(xml, subtotal, total) {
  const traslados = encontrarTodosTagAttrs(xml, 'Traslado');
  let iva = 0;
  let encontrado = false;
  for (const t of traslados) {
    const impuesto = String(t.Impuesto ?? '');
    if (impuesto === '002' || impuesto === 'IVA') {
      const importe = parsearNumeroCfdi(t.Importe);
      if (importe != null) {
        iva += importe;
        encontrado = true;
      }
    }
  }
  if (encontrado) return redondear(iva);
  if (subtotal != null && total != null) return redondear(Math.max(0, total - subtotal));
  return 0;
}

/**
 * Parsea un CFDI 3.3 / 4.0 (ingresos) a campos de Factura.
 * @returns {{ ok: true, doc: object, meta: object } | { ok: false, mensaje: string }}
 */
export function parsearCfdiXml(xmlTexto, nombreArchivo = '') {
  const xml = String(xmlTexto ?? '');
  if (!xml.includes('Comprobante')) {
    return { ok: false, mensaje: 'No parece un CFDI XML válido (falta Comprobante)' };
  }

  const comp = encontrarTagAttrs(xml, 'Comprobante');
  if (!comp) {
    return { ok: false, mensaje: 'No se pudo leer el nodo Comprobante' };
  }

  const tipo = String(comp.TipoDeComprobante ?? 'I').toUpperCase();
  if (tipo === 'P') {
    return parsearCfdiPagoXml(xmlTexto, nombreArchivo);
  }
  if (tipo && tipo !== 'I') {
    return {
      ok: false,
      mensaje: `TipoDeComprobante "${tipo}" omitido (solo ingresos "I" y complementos "P")`,
    };
  }

  const emisor = encontrarTagAttrs(xml, 'Emisor') ?? {};
  const receptor = encontrarTagAttrs(xml, 'Receptor') ?? {};
  const timbre = encontrarTagAttrs(xml, 'TimbreFiscalDigital') ?? {};

  const uuid = String(timbre.UUID ?? '').trim().toUpperCase();
  const fechaFacturacion = fechaDesdeCfdi(comp.Fecha);
  if (!esFechaFacturaValida(fechaFacturacion)) {
    return { ok: false, mensaje: 'Fecha de facturación inválida o ausente' };
  }

  const subtotal = parsearNumeroCfdi(comp.SubTotal);
  const total = parsearNumeroCfdi(comp.Total);
  if (total == null || total < 0) {
    return { ok: false, mensaje: 'Total inválido o ausente' };
  }

  const sub = subtotal != null ? redondear(subtotal) : redondear(total);
  const iva = ivaDesdeXml(xml, sub, redondear(total));
  const cliente = String(receptor.Nombre ?? receptor.Rfc ?? '').trim();
  if (!cliente) {
    return { ok: false, mensaje: 'Receptor sin nombre ni RFC' };
  }

  let noFactura = folioDesdeComprobante(comp);
  if (!noFactura && uuid) {
    noFactura = `CFDI-${uuid.slice(0, 8)}`;
  }
  if (!noFactura) {
    return { ok: false, mensaje: 'Sin Serie/Folio ni UUID para identificar la factura' };
  }

  const metodoRaw = normalizarMetodoPago(comp.MetodoPago) || String(comp.MetodoPago ?? '').toUpperCase();
  const metodoPago = ['PUE', 'PPD', 'NA'].includes(metodoRaw) ? metodoRaw : 'PUE';

  const rfcEmisorCodigo = rfcCodigoDesdeRfc(emisor.Rfc);
  const esPue = metodoPago === 'PUE';

  const doc = {
    fechaFacturacion,
    fechaPago: esPue ? fechaFacturacion : null,
    noFactura,
    cliente,
    concepto: conceptoDesdeXml(xml),
    unidad: null,
    unidadManual: false,
    clasificacionAuto: false,
    subtotal: sub,
    iva,
    total: redondear(total),
    estatusEnvio: 'ENVIADA',
    estatusPago: esPue ? 'PAGADO' : 'PENDIENTE',
    metodoPago,
    montoPagado: esPue ? redondear(total) : 0,
    rfcEmisor: rfcEmisorCodigo,
    uuid: uuid || '',
    origen: 'cfdi-xml',
    mes: mesDesdeFecha(fechaFacturacion),
  };

  return {
    ok: true,
    tipo: 'I',
    doc,
    meta: {
      nombreArchivo: nombreArchivo || '',
      rfcEmisorRaw: String(emisor.Rfc ?? '').trim().toUpperCase(),
      nombreEmisor: String(emisor.Nombre ?? '').trim(),
      rfcReceptor: String(receptor.Rfc ?? '').trim().toUpperCase(),
      tipoComprobante: tipo || 'I',
    },
  };
}

/**
 * Parsea un CFDI de pago (tipo P / REP) 1.0 o 2.0.
 */
export function parsearCfdiPagoXml(xmlTexto, nombreArchivo = '') {
  const xml = String(xmlTexto ?? '');
  const comp = encontrarTagAttrs(xml, 'Comprobante');
  if (!comp) {
    return { ok: false, mensaje: 'No se pudo leer el nodo Comprobante' };
  }

  const emisor = encontrarTagAttrs(xml, 'Emisor') ?? {};
  const receptor = encontrarTagAttrs(xml, 'Receptor') ?? {};
  const timbre = encontrarTagAttrs(xml, 'TimbreFiscalDigital') ?? {};
  const uuid = String(timbre.UUID ?? '').trim().toLowerCase();
  if (!uuid) {
    return { ok: false, mensaje: 'Complemento sin UUID (timbre fiscal)' };
  }

  const fechaEmision = fechaDesdeCfdi(comp.Fecha);
  if (!fechaEmision) {
    return { ok: false, mensaje: 'Fecha de emisión del complemento inválida' };
  }

  const pagos = encontrarBloques(xml, 'Pago');
  if (!pagos.length) {
    return { ok: false, mensaje: 'No se encontró el nodo Pago del complemento (REP)' };
  }

  const documentos = [];
  let montoTotal = 0;
  let fechaPago = null;
  let formaPago = '03';
  let moneda = 'MXN';
  let tipoCambio = 1;

  for (const pago of pagos) {
    const fp = fechaDesdeCfdi(pago.attrs.FechaPago);
    if (fp && (!fechaPago || fp > fechaPago)) fechaPago = fp;
    montoTotal += parsearNumeroCfdi(pago.attrs.Monto) ?? 0;
    if (pago.attrs.FormaDePagoP) formaPago = formaPagoSat(pago.attrs.FormaDePagoP);
    if (pago.attrs.MonedaP) moneda = monedaComplemento(pago.attrs.MonedaP);
    const tc = parsearNumeroCfdi(pago.attrs.TipoCambioP);
    if (tc != null) tipoCambio = tc;

    const docs = encontrarTodosTagAttrs(pago.inner || xml, 'DoctoRelacionado');
    for (const d of docs) {
      const uuidFactura = String(d.IdDocumento ?? '').trim().toUpperCase();
      const serie = String(d.Serie ?? '').trim();
      const folio = String(d.Folio ?? '').trim();
      const noFactura = serie && folio ? `${serie}-${folio}` : folio || serie;
      const impPagado = parsearNumeroCfdi(d.ImpPagado) ?? parsearNumeroCfdi(d.ImportePagado);
      documentos.push({
        uuidFactura,
        noFactura,
        importePagado: impPagado != null ? redondear(impPagado) : null,
        numParcialidad: Number(d.NumParcialidad) || 1,
        saldoAnterior: parsearNumeroCfdi(d.ImpSaldoAnt),
        saldoInsoluto: parsearNumeroCfdi(d.ImpSaldoInsoluto),
        monedaP: monedaComplemento(d.MonedaDR || pago.attrs.MonedaP),
      });
    }
  }

  if (!documentos.length) {
    return { ok: false, mensaje: 'El complemento no trae factura relacionada (DoctoRelacionado)' };
  }

  const totales = encontrarTagAttrs(xml, 'Totales');
  const montoTotales = parsearNumeroCfdi(totales?.MontoTotalPagos);
  if (montoTotales != null) montoTotal = montoTotales;

  if (montoTotal <= 0) {
    montoTotal = documentos.reduce((acc, d) => acc + (d.importePagado || 0), 0);
  }
  if (montoTotal <= 0) {
    return { ok: false, mensaje: 'Monto de pago inválido' };
  }

  if (documentos.length === 1 && documentos[0].importePagado == null) {
    documentos[0].importePagado = redondear(montoTotal);
  }

  let folio = folioDesdeComprobante(comp);
  if (!folio) folio = `REP-${uuid.slice(0, 8)}`;

  return {
    ok: true,
    tipo: 'P',
    doc: {
      uuid,
      folio,
      fechaEmision,
      fechaPago: fechaPago || fechaEmision,
      monto: redondear(montoTotal),
      moneda,
      tipoCambio,
      formaPago,
      cliente: String(receptor.Nombre ?? receptor.Rfc ?? '').trim(),
      documentos,
      rfcEmisor: rfcCodigoDesdeRfc(emisor.Rfc),
    },
    meta: {
      nombreArchivo: nombreArchivo || '',
      rfcEmisorRaw: String(emisor.Rfc ?? '').trim().toUpperCase(),
      nombreEmisor: String(emisor.Nombre ?? '').trim(),
      rfcReceptor: String(receptor.Rfc ?? '').trim().toUpperCase(),
      tipoComprobante: 'P',
    },
  };
}

async function resolverUnidad(cliente, unidadDefault, indiceMapa) {
  if (unidadDefault && unidadDefault !== 'auto') {
    if (unidadDefault === 'vacia') return { unidad: null, clasificacionAuto: false };
    const u = unidadValidaParaFactura(unidadDefault);
    if (u) return { unidad: u, clasificacionAuto: false };
  }

  const hist = await historialCliente(cliente);
  if (hist?.unidadSugerida) {
    const u = unidadValidaParaFactura(hist.unidadSugerida);
    if (u) return { unidad: u, clasificacionAuto: false };
  }

  const { unidad, clasificacionAuto } = clasificarPorCliente(cliente, indiceMapa);
  return { unidad, clasificacionAuto: Boolean(clasificacionAuto) };
}

async function cargarExistentes(docs) {
  const folios = [...new Set(docs.map((d) => d.noFactura).filter(Boolean))];
  const uuids = [...new Set(docs.map((d) => d.uuid).filter(Boolean))];

  const [porFolio, porUuid] = await Promise.all([
    folios.length
      ? Factura.find({ noFactura: { $in: folios }, ...FILTRO_ACTIVAS }).lean()
      : [],
    uuids.length
      ? Factura.find({ uuid: { $in: uuids }, ...FILTRO_ACTIVAS }).lean()
      : [],
  ]);

  const mapFolio = new Map(porFolio.map((f) => [f.noFactura, f]));
  const mapUuid = new Map(porUuid.filter((f) => f.uuid).map((f) => [String(f.uuid).toUpperCase(), f]));
  return { mapFolio, mapUuid };
}

function clasificarBadge(doc, existente) {
  if (!doc.unidad) {
    if (existente) return { badge: 'DUPLICADO', mensaje: 'Ya existe (sin unidad en preview)' };
    return { badge: 'SIN_CLASIFICAR', mensaje: '' };
  }
  if (existente) return { badge: 'DUPLICADO', mensaje: '' };
  return { badge: 'NUEVA', mensaje: '' };
}

function aplicarDefaults(doc, defaults = {}) {
  const out = { ...doc };
  if (defaults.rfcEmisor && defaults.rfcEmisor !== 'auto') {
    out.rfcEmisor = normalizarRfcEmisor(defaults.rfcEmisor);
  }
  return out;
}

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buscarFacturaRelacionada(docRel, loteIngresos = []) {
  const uuid = String(docRel.uuidFactura ?? '').trim().toUpperCase();
  if (uuid) {
    const enLote = loteIngresos.find((p) => String(p.doc.uuid ?? '').toUpperCase() === uuid);
    if (enLote) return { fuente: 'lote', noFactura: enLote.doc.noFactura, uuid, unidad: enLote.doc.unidad };
    const enDb = await Factura.findOne({
      ...FILTRO_ACTIVAS,
      uuid: { $regex: new RegExp(`^${escaparRegex(uuid)}$`, 'i') },
    }).lean();
    if (enDb) return enDb;
  }

  const folio = String(docRel.noFactura ?? '').trim();
  if (folio) {
    const enLote = loteIngresos.find((p) => p.doc.noFactura === folio);
    if (enLote) {
      return { fuente: 'lote', noFactura: enLote.doc.noFactura, uuid: enLote.doc.uuid, unidad: enLote.doc.unidad };
    }
    const enDb = await Factura.findOne({ ...FILTRO_ACTIVAS, noFactura: folio }).lean();
    if (enDb) return enDb;
  }

  return null;
}

async function cargarComplementosExistentes(uuids) {
  const limpios = [...new Set(uuids.map((u) => String(u).toLowerCase()).filter(Boolean))];
  if (!limpios.length) return new Set();
  const rows = await ComplementoPago.find({ uuid: { $in: limpios } }).select('uuid').lean();
  return new Set(rows.map((r) => String(r.uuid).toLowerCase()));
}

async function crearComplementoDesdeCfdi(doc, usuarioId) {
  const ya = await ComplementoPago.findOne({ uuid: doc.uuid }).select('_id').lean();
  if (ya) return { skip: 'duplicado' };

  const relaciones = [];
  for (const d of doc.documentos) {
    const factura = await buscarFacturaRelacionada(d);
    if (!factura || !factura._id) {
      throw new Error(`No está la factura ${d.noFactura || d.uuidFactura} en el sistema`);
    }

    if (factura.metodoPago !== 'PPD') {
      await Factura.updateOne({ _id: factura._id }, { $set: { metodoPago: 'PPD' } });
    }

    const importe = d.importePagado ?? 0;
    if (importe <= 0) {
      throw new Error(`Importe inválido para ${factura.noFactura}`);
    }

    const saldoAnterior =
      d.saldoAnterior != null
        ? redondear(d.saldoAnterior)
        : redondear((factura.total || 0) - (factura.montoPagado || 0));

    relaciones.push({
      facturaId: factura._id,
      noFactura: factura.noFactura,
      uuidFactura: factura.uuid || d.uuidFactura,
      importePagado: importe,
      numParcialidad: d.numParcialidad ?? 1,
      saldoAnterior,
      saldoInsoluto:
        d.saldoInsoluto != null ? redondear(d.saldoInsoluto) : redondear(saldoAnterior - importe),
      monedaP: d.monedaP || 'MXN',
    });
  }

  const suma = redondear(relaciones.reduce((acc, r) => acc + r.importePagado, 0));
  const monto = Math.abs(suma - doc.monto) <= 0.01 ? redondear(doc.monto) : suma;

  const primera = await Factura.findById(relaciones[0].facturaId).select('unidad').lean();

  await ComplementoPago.create({
    uuid: doc.uuid,
    folio: doc.folio,
    fechaEmision: doc.fechaEmision,
    fechaPago: doc.fechaPago,
    monto,
    moneda: doc.moneda || 'MXN',
    tipoCambio: doc.tipoCambio ?? 1,
    formaPago: doc.formaPago || '03',
    facturasRelacionadas: relaciones,
    unidad: unidadComplemento(primera?.unidad),
    cliente: doc.cliente,
    origen: 'cfdi_xml',
    createdBy: usuarioId,
  });

  await recalcularFacturasDeComplemento(relaciones.map((r) => r.facturaId));
  return { ok: true };
}

/**
 * @param {{ buffer: Buffer, originalname?: string }[]} archivos
 * @param {{ rfcEmisor?: string, unidad?: string, estatusPago?: string }} defaults
 */
export async function previewCfdiXml(archivos, defaults = {}) {
  const indiceMapa = await construirIndiceMapa();
  const ingresos = [];
  const pagos = [];
  const errores = [];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    const nombre = archivo.originalname || `archivo-${i + 1}.xml`;
    if (!/\.xml$/i.test(nombre) && !String(archivo.buffer?.toString('utf8', 0, 200) ?? '').includes('Comprobante')) {
      errores.push({ archivo: nombre, mensaje: 'Solo se aceptan archivos XML de CFDI (ignora los PDF)' });
      continue;
    }

    const texto = archivo.buffer.toString('utf8');
    const parsed = parsearCfdiXml(texto, nombre);
    if (!parsed.ok) {
      errores.push({ archivo: nombre, mensaje: parsed.mensaje });
      continue;
    }

    if (parsed.tipo === 'P') {
      pagos.push({ archivo: nombre, doc: parsed.doc, meta: parsed.meta });
      continue;
    }

    let doc = aplicarDefaults(parsed.doc, defaults);
    const { unidad, clasificacionAuto } = await resolverUnidad(
      doc.cliente,
      defaults.unidad ?? 'auto',
      indiceMapa
    );
    doc = { ...doc, unidad, clasificacionAuto, unidadManual: false };
    ingresos.push({ archivo: nombre, doc, meta: parsed.meta });
  }

  const { mapFolio, mapUuid } = await cargarExistentes(ingresos.map((p) => p.doc));
  const uuidsComp = await cargarComplementosExistentes(pagos.map((p) => p.doc.uuid));
  const contadores = {
    NUEVA: 0,
    DUPLICADO: 0,
    SIN_CLASIFICAR: 0,
    SIN_FACTURA: 0,
    ERROR: errores.length,
    OMITIDA: 0,
  };
  const filas = [];

  for (const p of ingresos) {
    const existente =
      mapFolio.get(p.doc.noFactura) ??
      (p.doc.uuid ? mapUuid.get(String(p.doc.uuid).toUpperCase()) : null);
    const { badge, mensaje } = clasificarBadge(p.doc, existente);
    contadores[badge] = (contadores[badge] || 0) + 1;
    filas.push({
      archivo: p.archivo,
      tipoXml: 'factura',
      badge,
      mensaje,
      existenteId: existente?._id ? String(existente._id) : null,
      noFactura: p.doc.noFactura,
      cliente: p.doc.cliente,
      concepto: p.doc.concepto,
      subtotal: p.doc.subtotal,
      iva: p.doc.iva,
      total: p.doc.total,
      fechaFacturacion: p.doc.fechaFacturacion?.toISOString?.() ?? p.doc.fechaFacturacion,
      rfcEmisor: p.doc.rfcEmisor,
      unidad: p.doc.unidad,
      uuid: p.doc.uuid,
      metodoPago: p.doc.metodoPago,
      estatusPago: p.doc.estatusPago,
      meta: p.meta,
    });
  }

  for (const p of pagos) {
    const uuidComp = String(p.doc.uuid).toLowerCase();
    if (uuidsComp.has(uuidComp)) {
      contadores.DUPLICADO += 1;
      filas.push(filaPreviewPago(p, 'DUPLICADO', 'Ya existe este complemento'));
      continue;
    }

    const faltantes = [];
    const relacionadas = [];
    for (const d of p.doc.documentos) {
      const factura = await buscarFacturaRelacionada(d, ingresos);
      if (!factura) {
        faltantes.push(d.noFactura || d.uuidFactura || 'sin UUID');
      } else {
        relacionadas.push(factura.noFactura || d.noFactura);
      }
    }

    if (faltantes.length) {
      contadores.SIN_FACTURA += 1;
      filas.push(
        filaPreviewPago(
          p,
          'SIN_FACTURA',
          `Falta la factura ${faltantes.join(', ')} (súbela en el mismo lote o impórtala antes)`
        )
      );
      continue;
    }

    contadores.NUEVA += 1;
    filas.push(
      filaPreviewPago(p, 'NUEVA', relacionadas.length ? `Paga: ${relacionadas.join(', ')}` : '')
    );
  }

  return {
    totalArchivos: archivos.length,
    totalValidas: filas.length,
    contadores,
    filas,
    errores,
    defaults: {
      rfcEmisor: defaults.rfcEmisor ?? 'auto',
      unidad: defaults.unidad ?? 'auto',
      estatusPago: defaults.estatusPago ?? 'PENDIENTE',
    },
  };
}

function filaPreviewPago(p, badge, mensaje) {
  return {
    archivo: p.archivo,
    tipoXml: 'complemento',
    badge,
    mensaje,
    noFactura: p.doc.folio,
    cliente: p.doc.cliente,
    concepto: (p.doc.documentos || []).map((d) => d.noFactura || d.uuidFactura).filter(Boolean).join(', '),
    subtotal: p.doc.monto,
    iva: 0,
    total: p.doc.monto,
    fechaFacturacion: p.doc.fechaPago?.toISOString?.() ?? p.doc.fechaPago,
    rfcEmisor: p.doc.rfcEmisor,
    unidad: null,
    uuid: p.doc.uuid,
    metodoPago: 'PPD',
    estatusPago: 'PAGADO',
    meta: p.meta,
  };
}

function docToUpdate(doc) {
  const {
    _id,
    createdAt,
    updatedAt,
    __v,
    deletedAt,
    ...rest
  } = doc;
  return rest;
}

function mergeActualizarVacios(existente, doc) {
  const merged = { ...existente };
  for (const [k, v] of Object.entries(doc)) {
    const actual = existente[k];
    const vacio =
      actual === undefined ||
      actual === null ||
      actual === '' ||
      (typeof actual === 'number' && actual === 0 && k !== 'subtotal' && k !== 'iva' && k !== 'total');
    if (vacio && v !== undefined && v !== null && v !== '') {
      merged[k] = v;
    }
  }
  return merged;
}

/**
 * @param {{ buffer: Buffer, originalname?: string }[]} archivos
 */
export async function importarCfdiXml({
  archivos,
  defaults = {},
  estrategiaDuplicados = 'ignorar',
  usuarioId = '',
}) {
  const indiceMapa = await construirIndiceMapa();
  const resumen = {
    totalArchivos: archivos.length,
    creadas: 0,
    actualizadas: 0,
    ignoradas: 0,
    omitidas: 0,
    sinClasificar: 0,
    complementosCreados: 0,
    complementosIgnorados: 0,
    errores: [],
  };

  const ingresos = [];
  const pagos = [];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    const nombre = archivo.originalname || `archivo-${i + 1}.xml`;
    const texto = archivo.buffer.toString('utf8');
    const parsed = parsearCfdiXml(texto, nombre);
    if (!parsed.ok) {
      resumen.errores.push({ fila: i + 1, archivo: nombre, mensaje: parsed.mensaje });
      continue;
    }

    if (parsed.tipo === 'P') {
      pagos.push({ filaNum: i + 1, archivo: nombre, doc: parsed.doc });
      continue;
    }

    let doc = aplicarDefaults(parsed.doc, defaults);
    const { unidad, clasificacionAuto } = await resolverUnidad(
      doc.cliente,
      defaults.unidad ?? 'auto',
      indiceMapa
    );
    doc = { ...doc, unidad, clasificacionAuto, unidadManual: false };
    ingresos.push({ filaNum: i + 1, archivo: nombre, doc });
  }

  const { mapFolio, mapUuid } = await cargarExistentes(ingresos.map((d) => d.doc));
  const foliosEnLote = new Set();
  const uuidsEnLote = new Set();
  const operaciones = [];

  for (const { filaNum, archivo, doc } of ingresos) {
    if (foliosEnLote.has(doc.noFactura)) {
      resumen.errores.push({
        fila: filaNum,
        archivo,
        mensaje: 'Folio duplicado dentro del lote',
      });
      continue;
    }
    foliosEnLote.add(doc.noFactura);
    if (doc.uuid) {
      const u = String(doc.uuid).toUpperCase();
      if (uuidsEnLote.has(u)) {
        resumen.errores.push({
          fila: filaNum,
          archivo,
          mensaje: 'UUID duplicado dentro del lote',
        });
        continue;
      }
      uuidsEnLote.add(u);
    }

    const existente =
      mapFolio.get(doc.noFactura) ??
      (doc.uuid ? mapUuid.get(String(doc.uuid).toUpperCase()) : null);

    if (existente) {
      if (estrategiaDuplicados === 'ignorar') {
        resumen.ignoradas += 1;
        continue;
      }
      let merged;
      if (estrategiaDuplicados === 'actualizarVacios') {
        merged = mergeActualizarVacios(existente, doc);
      } else {
        merged = { ...existente, ...doc };
      }
      merged.origen = existente.origen === 'manual' ? existente.origen : 'cfdi-xml';
      if (existente.unidadManual) {
        merged.unidad = existente.unidad;
        merged.clasificacionAuto = existente.clasificacionAuto;
        merged.unidadManual = true;
      }
      operaciones.push({
        updateOne: {
          filter: { _id: existente._id },
          update: { $set: docToUpdate(merged) },
        },
      });
      resumen.actualizadas += 1;
    } else {
      operaciones.push({ insertOne: { document: doc } });
      resumen.creadas += 1;
      if (!doc.unidad) resumen.sinClasificar += 1;
    }
  }

  for (let i = 0; i < operaciones.length; i += BATCH_SIZE) {
    const lote = operaciones.slice(i, i + BATCH_SIZE);
    if (lote.length) {
      await Factura.bulkWrite(lote, { ordered: false });
    }
  }

  for (const { filaNum, archivo, doc } of pagos) {
    try {
      const resultado = await crearComplementoDesdeCfdi(doc, usuarioId);
      if (resultado.skip === 'duplicado') {
        if (estrategiaDuplicados === 'ignorar') {
          resumen.complementosIgnorados += 1;
          resumen.ignoradas += 1;
        } else {
          resumen.errores.push({
            fila: filaNum,
            archivo,
            mensaje: 'El complemento ya existe (UUID duplicado)',
          });
        }
        continue;
      }
      resumen.complementosCreados += 1;
    } catch (err) {
      resumen.errores.push({
        fila: filaNum,
        archivo,
        mensaje: err instanceof Error ? err.message : 'No se pudo importar el complemento',
      });
    }
  }

  let archivoPath = '';
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const manifiesto = [
      ...ingresos.map((d) => `I\t${d.archivo}\t${d.doc.noFactura}\t${d.doc.uuid}`),
      ...pagos.map((d) => `P\t${d.archivo}\t${d.doc.folio}\t${d.doc.uuid}`),
    ].join('\n');
    const hash = createHash('md5').update(manifiesto).digest('hex').slice(0, 12);
    archivoPath = path.join(UPLOAD_DIR, `${Date.now()}-${hash}-manifiesto.txt`);
    await writeFile(archivoPath, manifiesto, 'utf8');
  } catch {
    /* filesystem opcional */
  }

  await ImportacionLog.create({
    fuente: 'cfdi-xml',
    usuario: String(usuarioId ?? ''),
    nombreArchivo: `${archivos.length} XML(s)`,
    archivoPath,
    totalFilas: ingresos.length + pagos.length,
    creadas: resumen.creadas,
    actualizadas: resumen.actualizadas,
    ignoradas: resumen.ignoradas,
    errores: resumen.errores.map((e) => ({
      fila: e.fila,
      mensaje: e.archivo ? `${e.archivo}: ${e.mensaje}` : e.mensaje,
    })),
    mappingUsado: { ...defaults, complementosCreados: resumen.complementosCreados },
    estrategiaDuplicados,
  });

  return resumen;
}
  const indiceMapa = await construirIndiceMapa();
  const parseados = [];
  const errores = [];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    const nombre = archivo.originalname || `archivo-${i + 1}.xml`;
    if (!/\.xml$/i.test(nombre) && !String(archivo.buffer?.toString('utf8', 0, 200) ?? '').includes('Comprobante')) {
      errores.push({ archivo: nombre, mensaje: 'Solo se aceptan archivos XML de CFDI (ignora los PDF)' });
      continue;
    }

    const texto = archivo.buffer.toString('utf8');
    const parsed = parsearCfdiXml(texto, nombre);
    if (!parsed.ok) {
      errores.push({ archivo: nombre, mensaje: parsed.mensaje });
      continue;
    }

    let doc = aplicarDefaults(parsed.doc, defaults);
    const { unidad, clasificacionAuto } = await resolverUnidad(
      doc.cliente,
      defaults.unidad ?? 'auto',
      indiceMapa
    );
    doc = { ...doc, unidad, clasificacionAuto, unidadManual: false };
    parseados.push({ archivo: nombre, doc, meta: parsed.meta });
  }

  const { mapFolio, mapUuid } = await cargarExistentes(parseados.map((p) => p.doc));
  const contadores = { NUEVA: 0, DUPLICADO: 0, SIN_CLASIFICAR: 0, ERROR: errores.length, OMITIDA: 0 };
  const filas = [];

  for (const p of parseados) {
    const existente =
      mapFolio.get(p.doc.noFactura) ??
      (p.doc.uuid ? mapUuid.get(String(p.doc.uuid).toUpperCase()) : null);
    const { badge, mensaje } = clasificarBadge(p.doc, existente);
    contadores[badge] = (contadores[badge] || 0) + 1;
    filas.push({
      archivo: p.archivo,
      badge,
      mensaje,
      existenteId: existente?._id ? String(existente._id) : null,
      ...p.doc,
      fechaFacturacion: p.doc.fechaFacturacion?.toISOString?.() ?? p.doc.fechaFacturacion,
      meta: p.meta,
    });
  }

  return {
    totalArchivos: archivos.length,
    totalValidas: filas.length,
    contadores,
    filas,
    errores,
    defaults: {
      rfcEmisor: defaults.rfcEmisor ?? 'auto',
      unidad: defaults.unidad ?? 'auto',
      estatusPago: defaults.estatusPago ?? 'PENDIENTE',
    },
  };
}

function docToUpdate(doc) {
  const {
    _id,
    createdAt,
    updatedAt,
    __v,
    deletedAt,
    ...rest
  } = doc;
  return rest;
}

function mergeActualizarVacios(existente, doc) {
  const merged = { ...existente };
  for (const [k, v] of Object.entries(doc)) {
    const actual = existente[k];
    const vacio =
      actual === undefined ||
      actual === null ||
      actual === '' ||
      (typeof actual === 'number' && actual === 0 && k !== 'subtotal' && k !== 'iva' && k !== 'total');
    if (vacio && v !== undefined && v !== null && v !== '') {
      merged[k] = v;
    }
  }
  return merged;
}

/**
 * @param {{ buffer: Buffer, originalname?: string }[]} archivos
 */
export async function importarCfdiXml({
  archivos,
  defaults = {},
  estrategiaDuplicados = 'ignorar',
  usuarioId = '',
}) {
  const indiceMapa = await construirIndiceMapa();
  const resumen = {
    totalArchivos: archivos.length,
    creadas: 0,
    actualizadas: 0,
    ignoradas: 0,
    omitidas: 0,
    sinClasificar: 0,
    errores: [],
  };

  const docsNuevos = [];
  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    const nombre = archivo.originalname || `archivo-${i + 1}.xml`;
    const texto = archivo.buffer.toString('utf8');
    const parsed = parsearCfdiXml(texto, nombre);
    if (!parsed.ok) {
      resumen.errores.push({ fila: i + 1, archivo: nombre, mensaje: parsed.mensaje });
      continue;
    }

    let doc = aplicarDefaults(parsed.doc, defaults);
    const { unidad, clasificacionAuto } = await resolverUnidad(
      doc.cliente,
      defaults.unidad ?? 'auto',
      indiceMapa
    );
    doc = { ...doc, unidad, clasificacionAuto, unidadManual: false };
    docsNuevos.push({ filaNum: i + 1, archivo: nombre, doc, xmlTexto: texto });
  }

  const { mapFolio, mapUuid } = await cargarExistentes(docsNuevos.map((d) => d.doc));
  const foliosEnLote = new Set();
  const uuidsEnLote = new Set();
  const operaciones = [];

  for (const { filaNum, archivo, doc } of docsNuevos) {
    if (foliosEnLote.has(doc.noFactura)) {
      resumen.errores.push({
        fila: filaNum,
        archivo,
        mensaje: 'Folio duplicado dentro del lote',
      });
      continue;
    }
    foliosEnLote.add(doc.noFactura);
    if (doc.uuid) {
      const u = String(doc.uuid).toUpperCase();
      if (uuidsEnLote.has(u)) {
        resumen.errores.push({
          fila: filaNum,
          archivo,
          mensaje: 'UUID duplicado dentro del lote',
        });
        continue;
      }
      uuidsEnLote.add(u);
    }

    const existente =
      mapFolio.get(doc.noFactura) ??
      (doc.uuid ? mapUuid.get(String(doc.uuid).toUpperCase()) : null);

    if (existente) {
      if (estrategiaDuplicados === 'ignorar') {
        resumen.ignoradas += 1;
        continue;
      }
      let merged;
      if (estrategiaDuplicados === 'actualizarVacios') {
        merged = mergeActualizarVacios(existente, doc);
      } else {
        merged = { ...existente, ...doc };
      }
      merged.origen = existente.origen === 'manual' ? existente.origen : 'cfdi-xml';
      if (existente.unidadManual) {
        merged.unidad = existente.unidad;
        merged.clasificacionAuto = existente.clasificacionAuto;
        merged.unidadManual = true;
      }
      operaciones.push({
        updateOne: {
          filter: { _id: existente._id },
          update: { $set: docToUpdate(merged) },
        },
      });
      resumen.actualizadas += 1;
    } else {
      operaciones.push({ insertOne: { document: doc } });
      resumen.creadas += 1;
      if (!doc.unidad) resumen.sinClasificar += 1;
    }
  }

  for (let i = 0; i < operaciones.length; i += BATCH_SIZE) {
    const lote = operaciones.slice(i, i + BATCH_SIZE);
    if (lote.length) {
      await Factura.bulkWrite(lote, { ordered: false });
    }
  }

  let archivoPath = '';
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const manifiesto = docsNuevos
      .map((d) => `${d.archivo}\t${d.doc.noFactura}\t${d.doc.uuid}`)
      .join('\n');
    const hash = createHash('md5').update(manifiesto).digest('hex').slice(0, 12);
    archivoPath = path.join(UPLOAD_DIR, `${Date.now()}-${hash}-manifiesto.txt`);
    await writeFile(archivoPath, manifiesto, 'utf8');
  } catch {
    /* filesystem opcional */
  }

  await ImportacionLog.create({
    fuente: 'cfdi-xml',
    usuario: String(usuarioId ?? ''),
    nombreArchivo: `${archivos.length} XML(s)`,
    archivoPath,
    totalFilas: docsNuevos.length,
    creadas: resumen.creadas,
    actualizadas: resumen.actualizadas,
    ignoradas: resumen.ignoradas,
    errores: resumen.errores.map((e) => ({
      fila: e.fila,
      mensaje: e.archivo ? `${e.archivo}: ${e.mensaje}` : e.mensaje,
    })),
    mappingUsado: defaults,
    estrategiaDuplicados,
  });

  return resumen;
}
