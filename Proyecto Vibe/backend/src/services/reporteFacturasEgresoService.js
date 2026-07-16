import * as XLSX from 'xlsx';
import { Egreso, ESTADOS_RESULTADO, UNIDADES, METODOS_PAGO, TIPOS_IMPUESTO, mesDesdeFecha } from '../models/Egreso.js';

const HOJA_EGRESOS_MENSUAL = /^EGRESOS\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO).*2026/i;

const MAPA_COLUMNAS = [
  { campo: 'fechaGasto', claves: ['fecha gasto', 'fecha del gasto', 'fecha de pago', 'fecha'] },
  { campo: 'proyecto', claves: ['proyecto'] },
  { campo: 'estadoResultado', claves: ['estado de resultado', 'estado resultado', 'estado'] },
  { campo: 'unidad', claves: ['area', 'unidad de negocio', 'unidad'] },
  { campo: 'tipoGasto', claves: ['tipo de gasto', 'tipo gasto', 'concepto en egresos'] },
  { campo: 'tipoSubgasto', claves: ['tipo de subgasto', 'subgasto', 'sub gasto'] },
  { campo: 'metodoPago', claves: ['metodo de pago', 'metodo pago', 'forma de pago'] },
  { campo: 'noFactura', claves: ['no. factura', 'no factura', 'numero de factura', 'folio'] },
  { campo: 'refNum', claves: ['num', '#'] },
  { campo: 'proveedor', claves: ['proveedor'] },
  { campo: 'concepto', claves: ['concepto', 'descripcion'] },
  { campo: 'subtotal', claves: ['subtotal', 'importe', 'monto'] },
  { campo: 'iva', claves: ['iva', 'impuesto'] },
  { campo: 'totalExcel', claves: ['total con iva', 'total'] },
  { campo: 'tipoImpuesto', claves: ['tipo de impuesto', 'tipo impuesto'] },
];

function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

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
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  const limpio = String(valor ?? '').replace(/[$,\s]/g, '').replace(/[^\d.\-]/g, '');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial) || serial < 1000) return null;
  const parsed = XLSX.SSF?.parse_date_code?.(serial);
  if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0));
  // Fallback: días desde 1899-12-30 (sistema 1900 de Excel)
  const utcDays = Math.floor(serial - 25569);
  return new Date(Date.UTC(1970, 0, utcDays, 12, 0, 0));
}

function aFecha(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
  if (typeof valor === 'number') {
    const fromSerial = excelSerialToDate(valor);
    if (fromSerial) return fromSerial;
    if (valor < 1000) return null;
  }
  const texto = String(valor ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [y, m, d] = texto.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizarUnidad(valor) {
  const norm = normalizar(valor);
  if (norm === 'strategy' || norm === 'consulting') return 'Consulting';
  if (norm === 'technologies') return 'Technologies';
  if (norm === 'grupo') return 'Grupo';
  if (norm === 'todos') return 'Todos';
  const laxo = UNIDADES.find((u) => normalizar(u) === norm);
  return laxo ?? 'Grupo';
}

function normalizarEnum(valor, permitidos, porDefecto = null) {
  const norm = normalizar(valor).toUpperCase().replace(/\s+/g, '_');
  const match = permitidos.find((p) => p.toUpperCase() === norm);
  if (match) return match;
  const laxo = permitidos.find((p) => normalizar(p) === normalizar(valor));
  return laxo ?? porDefecto;
}

function inferirTipoImpuesto(subtotal, iva) {
  const base = aNumero(subtotal);
  const imp = aNumero(iva);
  if (base <= 0 || imp === 0) return 'CERO';
  const ratio = imp / base;
  if (Math.abs(ratio - 0.16) < 0.025) return 'IVA_16';
  if (Math.abs(ratio - 0.08) < 0.025) return 'IVA_8';
  return 'CERO';
}

function detectarEncabezado(matriz) {
  for (let i = 0; i < Math.min(matriz.length, 25); i++) {
    const fila = matriz[i] ?? [];
    const mapeo = {};
    fila.forEach((celda, indice) => {
      const campo = detectarCampo(celda);
      if (campo && mapeo[campo] === undefined) mapeo[campo] = indice;
    });
    const tieneFecha = mapeo.fechaGasto !== undefined;
    const tieneProv = mapeo.proveedor !== undefined;
    const tieneMonto = mapeo.subtotal !== undefined || mapeo.totalExcel !== undefined;
    if (tieneFecha && tieneProv && tieneMonto) {
      return { filaEncabezado: i, mapeo };
    }
  }
  return null;
}

function parsearMatrizEgresos(matriz, { hoja, mesMin, mesMax } = {}) {
  const enc = detectarEncabezado(matriz);
  if (!enc) {
    return { hoja, registros: [], errores: [{ fila: 0, motivo: 'Encabezado no detectado' }] };
  }

  const { filaEncabezado, mapeo } = enc;
  const registros = [];
  const errores = [];

  for (let i = filaEncabezado + 1; i < matriz.length; i++) {
    const fila = matriz[i];
    if (!fila || fila.every((c) => String(c ?? '').trim() === '')) continue;

    const valor = (campo) => (mapeo[campo] !== undefined ? fila[mapeo[campo]] : undefined);

    const fecha = aFecha(valor('fechaGasto'));
    const proveedor = String(valor('proveedor') ?? '').trim();
    let concepto = String(valor('concepto') ?? '').trim();
    const tipoGastoRaw = String(valor('tipoGasto') ?? '').trim();
    let subtotal = aNumero(valor('subtotal'));
    const iva = aNumero(valor('iva'));
    const totalExcel = aNumero(valor('totalExcel'));

    if (!proveedor && !concepto && !subtotal && !totalExcel) continue;

    if (!fecha || !proveedor) {
      errores.push({ fila: i + 1, hoja, motivo: 'Falta fecha o proveedor' });
      continue;
    }

    if (!concepto) concepto = tipoGastoRaw || proveedor;
    if (subtotal <= 0 && totalExcel > 0) subtotal = totalExcel;
    if (subtotal <= 0) {
      errores.push({ fila: i + 1, hoja, motivo: 'Subtotal inválido' });
      continue;
    }

    const mes = mesDesdeFecha(fecha);
    if (mesMin && mes < mesMin) continue;
    if (mesMax && mes > mesMax) continue;

    const refNum = String(valor('refNum') ?? '').trim();
    let noFactura = String(valor('noFactura') ?? '').trim();
    if (!noFactura && refNum) noFactura = `REF-${refNum}`;
    if (noFactura === 'N/A') noFactura = refNum ? `REF-${refNum}` : '';

    registros.push({
      fechaGasto: fecha,
      mes,
      proyecto: String(valor('proyecto') ?? '').trim(),
      estadoResultado: normalizarEnum(valor('estadoResultado'), ESTADOS_RESULTADO, 'ADMINISTRATIVO'),
      unidad: normalizarUnidad(valor('unidad')),
      tipoGasto: (tipoGastoRaw || 'OTROS').toUpperCase(),
      tipoSubgasto: String(valor('tipoSubgasto') ?? '').trim(),
      metodoPago: normalizarEnum(valor('metodoPago'), METODOS_PAGO, undefined),
      noFactura,
      proveedor,
      concepto,
      subtotal,
      tipoImpuesto:
        normalizarEnum(valor('tipoImpuesto'), TIPOS_IMPUESTO, null) ??
        inferirTipoImpuesto(subtotal, iva),
      _meta: { hoja, fila: i + 1, refNum },
    });
  }

  return { hoja, registros, errores };
}

export function listarHojasEgresosReporte(libro) {
  return libro.SheetNames.filter((n) => HOJA_EGRESOS_MENSUAL.test(n));
}

export function parsearEgresosReporteFacturas(buffer, { mesDesde, mesHasta, hojas } = {}) {
  const libro = XLSX.read(buffer, { type: 'buffer' });
  const hojasUsar = hojas?.length ? hojas : listarHojasEgresosReporte(libro);

  const todosRegistros = [];
  const todosErrores = [];
  const resumenHojas = [];

  for (const nombreHoja of hojasUsar) {
    if (!libro.SheetNames.includes(nombreHoja)) continue;
    const matriz = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], {
      header: 1,
      defval: '',
      raw: true,
    });
    const { registros, errores } = parsearMatrizEgresos(matriz, {
      hoja: nombreHoja,
      mesMin: mesDesde,
      mesMax: mesHasta,
    });
    todosRegistros.push(...registros);
    todosErrores.push(...errores);
    resumenHojas.push({ hoja: nombreHoja, registros: registros.length, errores: errores.length });
  }

  return {
    hojas: resumenHojas,
    registros: todosRegistros,
    errores: todosErrores,
  };
}

export async function importarEgresosReporteFacturas(registros, { reemplazarMeses = [], dryRun = false } = {}) {
  const mesesAfectados = [...new Set(registros.map((r) => r.mes))].sort();
  const mesesBorrar = reemplazarMeses.length ? reemplazarMeses : mesesAfectados;

  if (!dryRun && mesesBorrar.length) {
    const borrados = await Egreso.deleteMany({ mes: { $in: mesesBorrar } });
    console.log(`  Eliminados ${borrados.deletedCount} egresos en meses: ${mesesBorrar.join(', ')}`);
  } else if (dryRun && mesesBorrar.length) {
    const n = await Egreso.countDocuments({ mes: { $in: mesesBorrar } });
    console.log(`  [dry-run] Se eliminarían ${n} egresos en: ${mesesBorrar.join(', ')}`);
  }

  let creados = 0;
  const fallidos = [];

  for (const registro of registros) {
    const { _meta, mes, ...doc } = registro;
    try {
      if (!dryRun) await Egreso.create(doc);
      creados += 1;
    } catch (error) {
      fallidos.push({ ..._meta, motivo: error.message });
    }
  }

  return { creados, fallidos, mesesAfectados, mesesBorrar };
}
