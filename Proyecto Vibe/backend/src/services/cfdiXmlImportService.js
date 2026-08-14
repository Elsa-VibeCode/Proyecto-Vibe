import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Factura, esFechaFacturaValida, mesDesdeFecha } from '../models/Factura.js';
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
  if (tipo && tipo !== 'I') {
    return {
      ok: false,
      mensaje: `TipoDeComprobante "${tipo}" omitido (solo se importan ingresos "I")`,
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

  const doc = {
    fechaFacturacion,
    fechaPago: null,
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
    estatusPago: 'PENDIENTE',
    metodoPago,
    rfcEmisor: rfcEmisorCodigo,
    uuid: uuid || '',
    origen: 'cfdi-xml',
    mes: mesDesdeFecha(fechaFacturacion),
  };

  return {
    ok: true,
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
  if (defaults.estatusPago) {
    out.estatusPago = defaults.estatusPago;
  }
  return out;
}

/**
 * @param {{ buffer: Buffer, originalname?: string }[]} archivos
 * @param {{ rfcEmisor?: string, unidad?: string, estatusPago?: string }} defaults
 */
export async function previewCfdiXml(archivos, defaults = {}) {
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
