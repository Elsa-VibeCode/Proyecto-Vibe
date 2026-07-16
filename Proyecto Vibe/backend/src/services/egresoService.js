import * as XLSX from 'xlsx';
import {
  Egreso,
  ESTADOS_RESULTADO,
  UNIDADES,
  METODOS_PAGO,
  TIPOS_IMPUESTO,
} from '../models/Egreso.js';

// Construye el filtro de Mongo a partir de los query params soportados.
export function construirFiltroEgresos({ mes, unidad, tipoGasto, proveedor, q } = {}) {
  const filtro = {};
  if (mes) filtro.mes = mes;
  if (unidad) filtro.unidad = unidad;
  if (tipoGasto) filtro.tipoGasto = tipoGasto;
  if (proveedor) filtro.proveedor = { $regex: escaparRegex(proveedor), $options: 'i' };

  if (q) {
    const rx = { $regex: escaparRegex(q), $options: 'i' };
    filtro.$or = [
      { proveedor: rx },
      { concepto: rx },
      { noFactura: rx },
      { tipoGasto: rx },
      { proyecto: rx },
    ];
  }

  return filtro;
}

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Totales de egresos (campo `total`) agrupados por unidad para un mes dado.
// `total` es la suma de TODOS los egresos del mes (incluye unidad "Todos").
export async function totalesPorUnidad(mes) {
  const match = mes ? { mes } : {};
  const filas = await Egreso.aggregate([
    { $match: match },
    { $group: { _id: '$unidad', suma: { $sum: '$total' } } },
  ]);

  const porUnidad = Object.fromEntries(filas.map((f) => [f._id, f.suma]));
  const redondear = (v) => Math.round((v || 0) * 100) / 100;

  return {
    grupo: redondear(porUnidad.Grupo),
    consulting: redondear(porUnidad.Consulting),
    technologies: redondear(porUnidad.Technologies),
    total: redondear(filas.reduce((acc, f) => acc + (f.suma || 0), 0)),
  };
}

// Lista de proveedores distintos (para autocompletar).
export async function proveedoresDistintos() {
  const proveedores = await Egreso.distinct('proveedor');
  return proveedores.filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
}

const NOMBRE_HOJA_EGRESOS = 'Captura Egresos';

function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Mapea un encabezado de columna del Excel a un campo del modelo Egreso.
const MAPA_COLUMNAS = [
  { campo: 'fechaGasto', claves: ['fecha gasto', 'fecha del gasto', 'fecha'] },
  { campo: 'proyecto', claves: ['proyecto'] },
  { campo: 'estadoResultado', claves: ['estado de resultado', 'estado resultado', 'estado'] },
  { campo: 'unidad', claves: ['unidad'] },
  { campo: 'tipoGasto', claves: ['tipo de gasto', 'tipo gasto'] },
  { campo: 'tipoSubgasto', claves: ['tipo de subgasto', 'subgasto', 'sub gasto'] },
  { campo: 'metodoPago', claves: ['metodo de pago', 'metodo pago', 'forma de pago'] },
  { campo: 'noFactura', claves: ['no factura', 'no. factura', 'numero de factura', 'folio', 'factura'] },
  { campo: 'proveedor', claves: ['proveedor'] },
  { campo: 'concepto', claves: ['concepto', 'descripcion'] },
  { campo: 'subtotal', claves: ['subtotal', 'importe', 'monto'] },
  { campo: 'tipoImpuesto', claves: ['tipo de impuesto', 'tipo impuesto', 'impuesto tipo'] },
];

function detectarCampo(encabezado) {
  const norm = normalizar(encabezado);
  if (!norm) return null;
  for (const { campo, claves } of MAPA_COLUMNAS) {
    if (claves.some((clave) => norm === clave || norm.includes(clave))) {
      return campo;
    }
  }
  return null;
}

function aNumero(valor) {
  if (typeof valor === 'number') return valor;
  const limpio = String(valor ?? '').replace(/[$,\s]/g, '').replace(/[^\d.\-]/g, '');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function aFecha(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number') {
    // Fecha serial de Excel (días desde 1899-12-30).
    if (valor > 1000) {
      const parsed = XLSX.SSF?.parse_date_code?.(valor);
      if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    // Evitar tratar números pequeños como ms epoch.
    if (valor < 1000) return null;
  }
  const texto = String(valor ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [y, m, d] = texto.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizarEnum(valor, permitidos, porDefecto = null) {
  const norm = normalizar(valor).toUpperCase().replace(/\s+/g, '_');
  const match = permitidos.find((p) => p.toUpperCase() === norm);
  if (match) return match;
  // Coincidencia laxa para unidad (Grupo/Consulting/Technologies/Todos)
  const laxo = permitidos.find((p) => normalizar(p) === normalizar(valor));
  return laxo ?? porDefecto;
}

// Parsea el buffer de un .xlsx, hoja "Captura Egresos", y devuelve
// objetos listos para insertar como Egreso (sin persistir).
export function parsearEgresosDesdeExcel(buffer, { nombreHoja } = {}) {
  const libro = XLSX.read(buffer, { type: 'buffer' });
  const hoja =
    nombreHoja && libro.SheetNames.includes(nombreHoja)
      ? nombreHoja
      : libro.SheetNames.find((n) => normalizar(n) === normalizar(NOMBRE_HOJA_EGRESOS)) ??
        libro.SheetNames[0];

  if (!hoja) {
    throw new Error('El archivo Excel no contiene hojas');
  }

  const matriz = XLSX.utils.sheet_to_json(libro.Sheets[hoja], {
    header: 1,
    defval: '',
    raw: true,
  });

  // Detecta la fila de encabezados: la primera que mapee al menos proveedor+subtotal+concepto.
  let filaEncabezado = -1;
  let mapeo = {};
  for (let i = 0; i < Math.min(matriz.length, 20); i++) {
    const fila = matriz[i] ?? [];
    const candidato = {};
    fila.forEach((celda, indice) => {
      const campo = detectarCampo(celda);
      if (campo && candidato[campo] === undefined) candidato[campo] = indice;
    });
    if (
      candidato.proveedor !== undefined &&
      candidato.subtotal !== undefined &&
      candidato.concepto !== undefined
    ) {
      filaEncabezado = i;
      mapeo = candidato;
      break;
    }
  }

  if (filaEncabezado === -1) {
    throw new Error(
      'No se detectaron las columnas de egresos (se requieren al menos Proveedor, Concepto y Subtotal).'
    );
  }

  const registros = [];
  const errores = [];

  for (let i = filaEncabezado + 1; i < matriz.length; i++) {
    const fila = matriz[i];
    if (!fila || fila.every((c) => String(c ?? '').trim() === '')) continue;

    const valor = (campo) =>
      mapeo[campo] !== undefined ? fila[mapeo[campo]] : undefined;

    const fecha = aFecha(valor('fechaGasto'));
    const proveedor = String(valor('proveedor') ?? '').trim();
    const concepto = String(valor('concepto') ?? '').trim();
    const subtotal = aNumero(valor('subtotal'));

    if (!proveedor && !concepto && !subtotal) continue;

    if (!fecha || !proveedor || !concepto) {
      errores.push({ fila: i + 1, motivo: 'Falta fecha, proveedor o concepto' });
      continue;
    }

    registros.push({
      fechaGasto: fecha,
      proyecto: String(valor('proyecto') ?? '').trim(),
      estadoResultado:
        normalizarEnum(valor('estadoResultado'), ESTADOS_RESULTADO, 'ADMINISTRATIVO'),
      unidad: normalizarEnum(valor('unidad'), UNIDADES, 'Grupo'),
      tipoGasto: String(valor('tipoGasto') ?? 'OTROS').trim().toUpperCase() || 'OTROS',
      tipoSubgasto: String(valor('tipoSubgasto') ?? '').trim(),
      metodoPago: normalizarEnum(valor('metodoPago'), METODOS_PAGO, undefined),
      noFactura: String(valor('noFactura') ?? '').trim(),
      proveedor,
      concepto,
      subtotal,
      tipoImpuesto: normalizarEnum(valor('tipoImpuesto'), TIPOS_IMPUESTO, 'IVA_16'),
    });
  }

  return { hoja, totalFilas: registros.length, registros, errores };
}

// Inserta registros de egresos (uno por uno para disparar el pre-validate del modelo).
export async function insertarEgresos(registros) {
  const creados = [];
  const fallidos = [];
  for (const registro of registros) {
    try {
      creados.push(await Egreso.create(registro));
    } catch (error) {
      fallidos.push({ registro, motivo: error.message });
    }
  }
  return { creados: creados.length, fallidos };
}
