import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import jschardet from 'jschardet';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';
import { Factura, esFechaFacturaValida, mesDesdeFecha } from '../models/Factura.js';
import { ImportacionLog } from '../models/ImportacionLog.js';
import {
  FILTRO_ACTIVAS,
  calcularIva,
  clasificarPorCliente,
  construirIndiceMapa,
  historialCliente,
  normalizarRfcEmisor,
  unidadValidaParaFactura,
} from './facturaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../uploads/sicofi');
const PREVIEW_LIMIT = 500;
const BATCH_SIZE = 50;

const CAMPOS_FACTURA = [
  'fechaFacturacion',
  'noFactura',
  'cliente',
  'concepto',
  'subtotal',
  'iva',
  'total',
  'fechaPago',
  'estatusEnvio',
  'estatusPago',
  'rfcEmisor',
  'uuid',
  'unidad',
];

const ALIAS_COLUMNAS = {
  fechaFacturacion: [
    'fecha de emision',
    'fecha de emisión',
    'fecha emision',
    'fecha facturacion',
    'fecha',
  ],
  serie: ['serie'],
  folio: ['folio', 'numero', 'número'],
  cliente: [
    'razon social receptor',
    'razón social receptor',
    'razon social',
    'razón social',
    'nombre receptor',
    'receptor',
    'cliente',
  ],
  concepto: [
    'concepto principal',
    'concepto',
    'descripcion del concepto',
    'descripción del concepto',
    'descripcion',
    'descripción',
    'detalle',
    'producto',
  ],
  subtotal: ['subtotal'],
  iva: ['iva trasladado', 'iva', 'impuesto trasladado'],
  total: ['total'],
  metodoPago: ['metodo de pago', 'método de pago', 'forma de pago'],
  estatusSat: ['estatus sat', 'estado sat', 'estatus cfdi', 'estado cfdi'],
  uuid: ['uuid', 'folio fiscal'],
  rfcEmisor: ['rfc emisor', 'rfc del emisor', 'emisor rfc'],
  rfcReceptor: ['rfc receptor', 'rfc cliente'],
  tipoComprobante: ['tipo de comprobante', 'tipo comprobante', 'tipo cfdi', 'tipo de cfdi'],
};

const ALIAS_EXCLUIR_FUZZY = ['tipo de cambio', 'tipo cambio', 'moneda', 'tipo de relación'];

function normalizarClave(texto) {
  return String(texto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function detectarDelimitador(texto) {
  const primera = texto.split(/\r?\n/)[0] ?? '';
  const comas = (primera.match(/,/g) ?? []).length;
  const puntos = (primera.match(/;/g) ?? []).length;
  return puntos > comas ? ';' : ',';
}

export function decodificarCsv(buffer) {
  const detected = jschardet.detect(buffer);
  let encoding = (detected?.encoding ?? 'utf-8').toLowerCase();
  if (encoding === 'ascii' || encoding === 'iso-8859-1' || encoding.includes('windows-1252')) {
    encoding = 'latin1';
  }
  if (encoding.includes('utf')) {
    const utf8 = buffer.toString('utf8');
    if (utf8.includes('�') && buffer.length > 0) {
      return { text: iconv.decode(buffer, 'latin1'), encoding: 'latin1 (fallback)' };
    }
    return { text: utf8, encoding: 'utf-8' };
  }
  return { text: iconv.decode(buffer, encoding), encoding };
}

export function parsearCsvTexto(texto) {
  const delimitador = detectarDelimitador(texto);
  const filas = parse(texto, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
    delimiter: delimitador,
    bom: true,
  });

  if (!filas.length) {
    throw new Error('El CSV no contiene filas de datos');
  }

  const columnas = Object.keys(filas[0] ?? {});
  if (columnas.length < 3) {
    throw new Error('El CSV tiene muy pocas columnas; verifica el separador y encoding');
  }

  const anchos = new Set(filas.slice(0, 20).map((f) => Object.keys(f).length));
  if (anchos.size > 1) {
    throw new Error('Columnas inconsistentes entre filas; revisa comillas o separador');
  }

  return { filas, columnas, delimitador };
}

export function parsearCsvBuffer(buffer) {
  const { text, encoding } = decodificarCsv(buffer);
  const parsed = parsearCsvTexto(text);
  return { ...parsed, encoding, texto: text, formato: 'csv' };
}

function valorCeldaAString(valor) {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return '';
    return valor.toISOString().slice(0, 10);
  }
  return String(valor).trim();
}

function filasACsvTexto(filas, columnas) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lineas = [columnas.map(esc).join(',')];
  for (const fila of filas) {
    lineas.push(columnas.map((col) => esc(fila[col])).join(','));
  }
  return lineas.join('\n');
}

export function esArchivoExcel(buffer, nombreArchivo = '') {
  const nombre = String(nombreArchivo).toLowerCase();
  if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) return true;
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  if (buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf) return true;
  return false;
}

export function parsearExcelSicofi(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const hoja = libro.SheetNames[0];
  if (!hoja) throw new Error('El archivo Excel no contiene hojas');

  const raw = XLSX.utils.sheet_to_json(libro.Sheets[hoja], { defval: '' });
  if (!raw.length) throw new Error('El archivo Excel no contiene filas de datos');

  const filas = raw.map((fila) => {
    const out = {};
    for (const [clave, valor] of Object.entries(fila)) {
      const col = String(clave).trim();
      if (!col) continue;
      out[col] = valorCeldaAString(valor);
    }
    return out;
  });

  const columnas = Object.keys(filas[0] ?? {});
  if (columnas.length < 3) {
    throw new Error('El Excel tiene muy pocas columnas; verifica que sea un export de Sicofi');
  }

  const texto = filasACsvTexto(filas, columnas);
  return {
    filas,
    columnas,
    delimitador: ',',
    encoding: 'Excel (.xlsx/.xls)',
    texto,
    formato: 'excel',
  };
}

export function parsearArchivoSicofi(buffer, nombreArchivo = '') {
  if (esArchivoExcel(buffer, nombreArchivo)) {
    return parsearExcelSicofi(buffer);
  }
  return parsearCsvBuffer(buffer);
}

function buscarColumna(columnas, aliases) {
  const mapa = new Map(columnas.map((c) => [normalizarClave(c), c]));
  for (const alias of aliases) {
    const hit = mapa.get(alias);
    if (hit) return hit;
  }
  for (const col of columnas) {
    const n = normalizarClave(col);
    if (ALIAS_EXCLUIR_FUZZY.some((ex) => n.includes(ex))) continue;
    for (const alias of aliases) {
      if (alias.length < 5) {
        if (n === alias) return col;
        continue;
      }
      if (n.includes(alias) || alias.includes(n)) return col;
    }
  }
  return null;
}

export function sugerirMapping(columnas) {
  const mapping = {
    fechaFacturacion: buscarColumna(columnas, ALIAS_COLUMNAS.fechaFacturacion),
    noFactura: null,
    noFacturaTipo: 'serie_folio',
    serie: buscarColumna(columnas, ALIAS_COLUMNAS.serie),
    folio: buscarColumna(columnas, ALIAS_COLUMNAS.folio),
    cliente: buscarColumna(columnas, ALIAS_COLUMNAS.cliente),
    concepto: buscarColumna(columnas, ALIAS_COLUMNAS.concepto),
    subtotal: buscarColumna(columnas, ALIAS_COLUMNAS.subtotal),
    iva: buscarColumna(columnas, ALIAS_COLUMNAS.iva),
    total: buscarColumna(columnas, ALIAS_COLUMNAS.total),
    metodoPago: buscarColumna(columnas, ALIAS_COLUMNAS.metodoPago),
    estatusSat: buscarColumna(columnas, ALIAS_COLUMNAS.estatusSat),
    uuid: buscarColumna(columnas, ALIAS_COLUMNAS.uuid),
    rfcEmisorCol: buscarColumna(columnas, ALIAS_COLUMNAS.rfcEmisor),
    tipoComprobante: buscarColumna(columnas, ALIAS_COLUMNAS.tipoComprobante),
  };

  if (mapping.serie && mapping.folio) {
    mapping.noFactura = `${mapping.serie} + ${mapping.folio}`;
    mapping.noFacturaTipo = 'serie_folio';
  } else if (mapping.folio) {
    mapping.noFactura = mapping.folio;
    mapping.noFacturaTipo = 'columna';
  }

  const camposSinMapping = [];
  if (!mapping.fechaFacturacion) camposSinMapping.push('fechaFacturacion');
  if (!mapping.noFactura && !mapping.folio) camposSinMapping.push('noFactura');
  if (!mapping.cliente) camposSinMapping.push('cliente');
  camposSinMapping.push('fechaPago', 'estatusPago', 'rfcEmisor', 'unidad');

  const defaultsSugeridos = {
    fechaPago: 'vacio',
    estatusPago: mapping.metodoPago ? 'metodo_pago' : 'PENDIENTE',
    rfcEmisor: mapping.rfcEmisorCol ? 'columna' : 'GBL',
    unidad: 'auto',
    concepto: mapping.concepto ? 'columna' : 'fijo',
    conceptoFijo: 'Servicios profesionales',
  };

  return { mapping, camposSinMapping, defaultsSugeridos };
}

const redondear = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function normalizarCliente(texto) {
  return String(texto ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function parsearNumeroCsv(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  let s = String(valor).trim().replace(/[$\s]/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    const partes = s.split(',');
    if (partes.length === 2 && partes[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parsearFechaCsv(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmY = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmY) {
    const dia = Number(dmY[1]);
    const mes = Number(dmY[2]) - 1;
    const anio = Number(dmY[3]);
    const d = new Date(Date.UTC(anio, mes, dia));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const meses = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  };
  const dmy = texto.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/i);
  if (dmy) {
    const mes = meses[dmy[2].toLowerCase().slice(0, 3)];
    if (mes !== undefined) {
      return new Date(Date.UTC(Number(dmy[3]), mes, Number(dmy[1])));
    }
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

function valorColumna(fila, col) {
  if (!col) return '';
  return fila[col] ?? '';
}

function construirNoFactura(fila, mapping) {
  if (mapping.noFacturaTipo === 'serie_folio' && mapping.serie && mapping.folio) {
    const serie = String(valorColumna(fila, mapping.serie)).trim();
    const folio = String(valorColumna(fila, mapping.folio)).trim();
    if (!folio) return '';
    if (serie) return `${serie}-${folio}`;
    return folio;
  }
  const col = mapping.noFacturaTipo === 'columna' ? mapping.folio || mapping.noFactura : mapping.noFactura;
  if (typeof col === 'string' && !fila[col] && mapping.folio) {
    return String(valorColumna(fila, mapping.folio)).trim();
  }
  return String(valorColumna(fila, col)).trim();
}

function estatusDesdeSat(valor) {
  const n = normalizarClave(valor);
  if (n.includes('cancel')) return { envio: 'CANCELADA', pago: 'CANCELADO' };
  return { envio: 'ENVIADA', pago: null };
}

function estatusPagoDesdeMetodo(valor, defaults) {
  if (defaults.estatusPago === 'PAGADO') return 'PAGADO';
  if (defaults.estatusPago === 'PENDIENTE') return 'PENDIENTE';
  const n = normalizarClave(valor);
  if (n.includes('pue') || n.includes('pagado')) return 'PAGADO';
  if (n.includes('ppd') || n.includes('pendiente')) return 'PENDIENTE';
  return 'PENDIENTE';
}

async function resolverUnidad(cliente, defaults, indiceMapa) {
  if (defaults.unidad === 'vacia') return { unidad: null, clasificacionAuto: false };
  const hist = await historialCliente(cliente);
  if (hist?.unidadSugerida) {
    const u = unidadValidaParaFactura(hist.unidadSugerida);
    if (u) return { unidad: u, clasificacionAuto: false };
  }
  const { unidad, clasificacionAuto } = clasificarPorCliente(cliente, indiceMapa);
  return { unidad, clasificacionAuto: Boolean(clasificacionAuto) };
}

function esTipoComprobanteP(valor) {
  const t = normalizarClave(valor);
  if (!t) return false;
  if (t === 'p') return true;
  if (t.startsWith('p ') || t === 'p.') return true;
  if (t.includes('complemento') && t.includes('pago')) return true;
  if (t.includes('tipo p')) return true;
  return false;
}

function textoIndicaComplementoPago(texto) {
  const n = normalizarClave(texto);
  if (!n) return false;
  if (n.includes('complemento') && n.includes('pago')) return true;
  if (n.includes('recepcion de pagos') || n.includes('recepción de pagos')) return true;
  if (n.includes('pago') && (n.includes('cfdi') || n.includes('factura') || n.includes('parcialidad'))) return true;
  if (/^pago(\s|$)/.test(n) || n === 'pago') return true;
  return false;
}

function columnaEsDescriptiva(nombreCol) {
  const n = normalizarClave(nombreCol);
  return (
    n.includes('concepto') ||
    n.includes('descripcion') ||
    n.includes('descripción') ||
    n.includes('detalle') ||
    n.includes('producto') ||
    n.includes('observ')
  );
}

function buscarTipoComprobanteEnFila(fila, mapping) {
  if (mapping.tipoComprobante) {
    return valorColumna(fila, mapping.tipoComprobante);
  }
  for (const col of Object.keys(fila)) {
    const nk = normalizarClave(col);
    if (nk === 'tipo' || nk === 'tipo de comprobante' || nk === 'tipo cfdi' || nk === 'tipo de cfdi') {
      return valorColumna(fila, col);
    }
  }
  return '';
}

function esComplementoPago(fila, mapping) {
  const tipoVal = buscarTipoComprobanteEnFila(fila, mapping);
  if (esTipoComprobanteP(tipoVal)) return true;

  const subtotal = parsearNumeroCsv(valorColumna(fila, mapping.subtotal));
  const total = parsearNumeroCsv(valorColumna(fila, mapping.total));
  const montosCero =
    (subtotal === null || subtotal === 0) && (total === null || total === 0);
  if (!montosCero) return false;

  if (mapping.concepto && textoIndicaComplementoPago(valorColumna(fila, mapping.concepto))) {
    return true;
  }

  for (const [col, val] of Object.entries(fila)) {
    if (columnaEsDescriptiva(col) && textoIndicaComplementoPago(String(val ?? ''))) {
      return true;
    }
  }

  return false;
}

function esTipoIngreso(fila, mapping) {
  const tipoVal = buscarTipoComprobanteEnFila(fila, mapping);
  if (!tipoVal) return true;
  if (esTipoComprobanteP(tipoVal)) return false;
  const t = normalizarClave(tipoVal);
  return t === 'i' || t.includes('ingreso') || t.includes('factura') || true;
}

export async function filaAModelo(fila, mapping, defaults, indiceMapa, filaNum) {
  if (esComplementoPago(fila, mapping)) {
    return { skip: true, motivo: 'Complemento de pago (tipo P / monto cero) omitido' };
  }
  if (!esTipoIngreso(fila, mapping)) {
    return { skip: true, motivo: 'Complemento de pago (tipo P) omitido' };
  }

  const errores = [];
  const fechaFacturacion = parsearFechaCsv(valorColumna(fila, mapping.fechaFacturacion));
  if (!esFechaFacturaValida(fechaFacturacion)) errores.push('Fecha de facturación inválida');

  const noFactura = construirNoFactura(fila, mapping);
  if (!noFactura) errores.push('Falta número de factura');

  const cliente = normalizarCliente(valorColumna(fila, mapping.cliente));
  if (!cliente) errores.push('Falta cliente');

  const conceptoRaw = mapping.concepto ? String(valorColumna(fila, mapping.concepto)).trim() : '';
  let concepto = conceptoRaw;
  if (!concepto) {
    if (defaults.concepto === 'folio') concepto = `Factura ${noFactura}`;
    else if (defaults.concepto === 'fijo') concepto = String(defaults.conceptoFijo ?? 'Servicios profesionales').trim();
  }
  if (!concepto) errores.push('Falta concepto');

  const subtotal = parsearNumeroCsv(valorColumna(fila, mapping.subtotal));
  if (subtotal === null || subtotal <= 0) errores.push('Subtotal inválido');

  let iva = parsearNumeroCsv(valorColumna(fila, mapping.iva));
  if (iva === null) iva = calcularIva(subtotal ?? 0, cliente);
  if (/novamex/i.test(cliente)) iva = 0;

  let total = parsearNumeroCsv(valorColumna(fila, mapping.total));
  if (total === null) total = redondear((subtotal ?? 0) + iva);

  const sat = estatusDesdeSat(valorColumna(fila, mapping.estatusSat));
  let estatusEnvio = sat.envio;
  let estatusPago =
    sat.pago ??
    estatusPagoDesdeMetodo(valorColumna(fila, mapping.metodoPago), defaults);

  let fechaPago = null;
  if (defaults.fechaPago === 'fechaFacturacion' && fechaFacturacion) {
    fechaPago = fechaFacturacion;
    if (estatusPago === 'PENDIENTE') estatusPago = 'PAGADO';
  }

  let rfcEmisor = 'GBL';
  if (defaults.rfcEmisor === 'columna' && mapping.rfcEmisorCol) {
    rfcEmisor = normalizarRfcEmisor(valorColumna(fila, mapping.rfcEmisorCol));
  } else if (defaults.rfcEmisor && defaults.rfcEmisor !== 'columna') {
    rfcEmisor = normalizarRfcEmisor(defaults.rfcEmisor);
  }

  const uuid = String(valorColumna(fila, mapping.uuid)).trim().toLowerCase();

  if (errores.length) {
    return {
      error: true,
      fila: filaNum,
      mensaje: errores.join('; '),
      preview: { noFactura, cliente },
    };
  }

  const { unidad, clasificacionAuto } = await resolverUnidad(cliente, defaults, indiceMapa);

  const doc = {
    fechaFacturacion,
    mes: mesDesdeFecha(fechaFacturacion),
    noFactura,
    cliente,
    concepto,
    subtotal: redondear(subtotal),
    iva: redondear(iva),
    total: redondear(total),
    fechaPago,
    estatusEnvio,
    estatusPago,
    rfcEmisor,
    uuid: uuid || undefined,
    unidad,
    unidadManual: false,
    clasificacionAuto,
    origen: 'sicofi',
  };

  return { doc, sinClasificar: !unidad };
}

async function cargarExistentes(filasDoc) {
  const folios = [...new Set(filasDoc.map((d) => d.noFactura).filter(Boolean))];
  const uuids = [...new Set(filasDoc.map((d) => d.uuid).filter(Boolean))];
  const [porFolio, porUuid] = await Promise.all([
    Factura.find({ ...FILTRO_ACTIVAS, noFactura: { $in: folios } }).lean(),
    uuids.length
      ? Factura.find({ ...FILTRO_ACTIVAS, uuid: { $in: uuids } }).lean()
      : [],
  ]);
  const mapFolio = new Map(porFolio.map((f) => [f.noFactura, f]));
  const mapUuid = new Map(porUuid.map((f) => [f.uuid, f]));
  return { mapFolio, mapUuid };
}

function clasificarFilaPreview(doc, existente, mapUuid) {
  if (doc.uuid && existente && existente.noFactura !== doc.noFactura) {
    const porUuid = mapUuid.get(doc.uuid);
    if (porUuid && porUuid.noFactura !== doc.noFactura) {
      return { badge: 'ERROR', mensaje: 'UUID duplicado con distinto folio' };
    }
  }
  if (existente) return { badge: 'DUPLICADO' };
  return { badge: 'NUEVA' };
}

export async function construirPreviewCompleto(
  buffer,
  mapping,
  defaults,
  limitePreview = PREVIEW_LIMIT,
  nombreArchivo = ''
) {
  const parsed = parsearArchivoSicofi(buffer, nombreArchivo);
  const { mapping: sugerido, camposSinMapping, defaultsSugeridos } = sugerirMapping(
    parsed.columnas
  );
  const mappingFinal = mapping ?? sugerido;
  const defaultsFinal = { ...defaultsSugeridos, ...defaults };
  const indiceMapa = await construirIndiceMapa();
  const previewData = await rebuildPreview(
    parsed.filas,
    mappingFinal,
    defaultsFinal,
    indiceMapa,
    limitePreview
  );

  return {
    columnasDetectadas: parsed.columnas,
    delimitador: parsed.delimitador,
    encoding: parsed.encoding,
    primeras5Filas: parsed.filas.slice(0, 5),
    mappingSugerido: sugerido,
    mapping: mappingFinal,
    defaults: defaultsFinal,
    camposSinMapping,
    defaultsSugeridos,
    ...previewData,
    texto: parsed.texto,
    filas: parsed.filas,
  };
}

export async function reconstruirPreviewConMapping(texto, mapping, defaults, limitePreview = PREVIEW_LIMIT) {
  const parsed = parsearCsvTexto(texto);
  const indiceMapa = await construirIndiceMapa();
  const previewData = await rebuildPreview(
    parsed.filas,
    mapping,
    defaults,
    indiceMapa,
    limitePreview
  );
  return { ...previewData, filas: parsed.filas, columnasDetectadas: parsed.columnas };
}
async function rebuildPreview(filas, mapping, defaults, indiceMapa, limite = PREVIEW_LIMIT) {
  const preview = [];
  const contadores = { NUEVA: 0, DUPLICADO: 0, SIN_CLASIFICAR: 0, ERROR: 0, OMITIDA: 0 };
  const docsMeta = [];

  for (let i = 0; i < Math.min(filas.length, limite); i++) {
    const filaNum = i + 2;
    const resultado = await filaAModelo(filas[i], mapping, defaults, indiceMapa, filaNum);
    if (resultado.skip) {
      contadores.OMITIDA += 1;
      preview.push({
        fila: filaNum,
        badge: 'OMITIDA',
        mensaje: resultado.motivo ?? 'Fila omitida',
        noFactura: construirNoFactura(filas[i], mapping) || '',
        cliente: normalizarCliente(valorColumna(filas[i], mapping.cliente)),
      });
      continue;
    }
    if (resultado.error) {
      contadores.ERROR += 1;
      preview.push({
        fila: filaNum,
        badge: 'ERROR',
        mensaje: resultado.mensaje,
        noFactura: resultado.preview?.noFactura ?? '',
        cliente: resultado.preview?.cliente ?? '',
      });
      continue;
    }
    docsMeta.push({ filaNum, doc: resultado.doc, sinClasificar: resultado.sinClasificar });
  }

  const { mapFolio, mapUuid } = await cargarExistentes(docsMeta.map((m) => m.doc));
  const foliosEnLote = new Set();

  for (const { filaNum, doc, sinClasificar } of docsMeta) {
    if (foliosEnLote.has(doc.noFactura)) {
      contadores.DUPLICADO += 1;
      preview.push({
        fila: filaNum,
        badge: 'DUPLICADO',
        mensaje: 'Folio duplicado dentro del CSV',
        sinClasificar,
        ...doc,
      });
      continue;
    }
    foliosEnLote.add(doc.noFactura);

    const existente = mapFolio.get(doc.noFactura) ?? (doc.uuid ? mapUuid.get(doc.uuid) : null);
    const clasif = clasificarFilaPreview(doc, existente, mapUuid);
    let badge = clasif.badge;
    if (badge === 'ERROR') {
      contadores.ERROR += 1;
      preview.push({ fila: filaNum, badge, mensaje: clasif.mensaje, ...doc });
      continue;
    }
    if (badge === 'DUPLICADO') {
      contadores.DUPLICADO += 1;
    } else if (sinClasificar) {
      badge = 'SIN_CLASIFICAR';
      contadores.SIN_CLASIFICAR += 1;
    } else {
      contadores.NUEVA += 1;
    }
    preview.push({ fila: filaNum, badge, sinClasificar, ...doc });
  }

  return {
    preview,
    contadores,
    totalFilas: filas.length,
    previewLimitado: filas.length > limite,
  };
}

function mergeActualizarVacios(existente, doc) {
  const out = { ...existente };
  for (const [k, v] of Object.entries(doc)) {
    if (v === undefined || v === null || v === '') continue;
    if (out[k] === null || out[k] === undefined || out[k] === '') out[k] = v;
  }
  return out;
}

function docToUpdate(doc) {
  const { _id, createdAt, updatedAt, ...rest } = doc;
  return rest;
}

export async function importarSicofi({
  filas,
  mapping,
  defaults,
  estrategiaDuplicados = 'ignorar',
  usuarioId = '',
  nombreArchivo = '',
  csvTexto = '',
}) {
  const indiceMapa = await construirIndiceMapa();
  const resumen = {
    totalFilas: filas.length,
    creadas: 0,
    actualizadas: 0,
    ignoradas: 0,
    omitidas: 0,
    sinClasificar: 0,
    errores: [],
  };

  const operaciones = [];
  const docsNuevos = [];

  for (let i = 0; i < filas.length; i++) {
    const filaNum = i + 2;
    const resultado = await filaAModelo(filas[i], mapping, defaults, indiceMapa, filaNum);
    if (resultado.skip) {
      resumen.omitidas += 1;
      continue;
    }
    if (resultado.error) {
      resumen.errores.push({ fila: filaNum, mensaje: resultado.mensaje });
      continue;
    }
    docsNuevos.push({ filaNum, doc: resultado.doc });
  }

  const { mapFolio, mapUuid } = await cargarExistentes(docsNuevos.map((d) => d.doc));
  const foliosEnLote = new Set();

  for (const { filaNum, doc } of docsNuevos) {
    if (foliosEnLote.has(doc.noFactura)) {
      resumen.errores.push({ fila: filaNum, mensaje: 'Folio duplicado dentro del CSV' });
      continue;
    }
    foliosEnLote.add(doc.noFactura);

    const existente = mapFolio.get(doc.noFactura) ?? (doc.uuid ? mapUuid.get(doc.uuid) : null);
    const clasif = clasificarFilaPreview(doc, existente, mapUuid);
    if (clasif.badge === 'ERROR') {
      resumen.errores.push({ fila: filaNum, mensaje: clasif.mensaje });
      continue;
    }

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
      merged.origen = existente.origen === 'manual' ? existente.origen : 'sicofi';
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
      operaciones.push({
        insertOne: { document: doc },
      });
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
  if (csvTexto) {
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
      const hash = createHash('md5').update(csvTexto).digest('hex').slice(0, 12);
      archivoPath = path.join(UPLOAD_DIR, `${Date.now()}-${hash}.csv`);
      await writeFile(archivoPath, csvTexto, 'utf8');
    } catch {
      /* filesystem opcional */
    }
  }

  const log = await ImportacionLog.create({
    fuente: 'sicofi',
    usuario: String(usuarioId ?? ''),
    nombreArchivo,
    archivoPath,
    totalFilas: resumen.totalFilas,
    creadas: resumen.creadas,
    actualizadas: resumen.actualizadas,
    ignoradas: resumen.ignoradas,
    errores: resumen.errores,
    mappingUsado: { mapping, defaults },
    estrategiaDuplicados,
  });

  return { ...resumen, logId: log._id };
}

export async function listarImportaciones(limite = 20) {
  return ImportacionLog.find({ fuente: 'sicofi' })
    .sort({ createdAt: -1 })
    .limit(limite)
    .lean();
}
