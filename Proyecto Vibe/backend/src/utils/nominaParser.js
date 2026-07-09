import { parsearNumero } from './excelFiltros.js';
import { parsearPeriodoDesdeEncabezado, fechaDesdePeriodo } from './nominaMotor.js';

function esEncabezadoPeriodo(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return false;
  const norm = texto.toLowerCase();
  return /q[12]$/i.test(norm) || /\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio)\b/i.test(norm);
}

function esFilaTotal(nombre) {
  const norm = String(nombre ?? '').toLowerCase();
  return norm.includes('total') || norm.includes('en cuenta') || norm.includes('transferir');
}

const BLOQUES_RESPONSABLE = [
  { colNombre: 1, colMonto: 2, responsable: 'Chava' },
  { colNombre: 3, colMonto: 4, responsable: 'Mario' },
  { colNombre: 5, colMonto: 6, responsable: 'Elsa' },
];

export function parsearNominaReal2026(filas, anioDefault = 2026) {
  const pagos = [];
  let periodoActual = `${anioDefault}-01-Q1`;

  for (const fila of filas) {
    if (!Array.isArray(fila) && typeof fila === 'object') {
      const valores = Object.values(fila);
      procesarFilaMatriz(valores, periodoActual, pagos, (p) => {
        periodoActual = p;
      }, anioDefault);
      continue;
    }

    const row = Array.isArray(fila) ? fila : Object.values(fila);
    periodoActual = procesarFilaMatriz(row, periodoActual, pagos, null, anioDefault) ?? periodoActual;
  }

  return pagos;
}

function procesarFilaMatriz(row, periodoActual, pagos, setPeriodo, anioDefault) {
  const primera = row[0];
  if (esEncabezadoPeriodo(primera)) {
    const nuevo = parsearPeriodoDesdeEncabezado(String(primera), anioDefault);
    if (setPeriodo) setPeriodo(nuevo);
    return nuevo;
  }

  for (const bloque of BLOQUES_RESPONSABLE) {
    const nombre = String(row[bloque.colNombre] ?? '').trim();
    const monto = parsearNumero(row[bloque.colMonto]);
    if (!nombre || monto === null || monto <= 0) continue;
    if (esFilaTotal(nombre)) continue;

    const periodo = periodoActual;
    pagos.push({
      colaborador: nombre,
      monto,
      periodo,
      fecha: fechaDesdePeriodo(periodo),
      concepto: `Nómina ${periodo} — ${bloque.responsable}`,
      responsableTransferencia: bloque.responsable,
      claveOrigen: `${periodo}|${bloque.responsable}|${nombre}|${monto}`,
    });
  }

  return null;
}

export function filaImportacionAVector(fila, columnas) {
  if (Array.isArray(fila)) return fila;
  return columnas.map((col, i) => fila[col] ?? fila[`Columna_${i + 1}`] ?? null);
}

export function parsearNominaRealDesdeExcelImport(importacion) {
  const filas = importacion.filas ?? [];
  const columnas = importacion.columnas ?? [];
  const vectores = filas.map((fila) => filaImportacionAVector(fila, columnas));
  return parsearNominaReal2026(vectores);
}
