import * as XLSX from 'xlsx';

const PATRONES_ENCABEZADO = [
  'colaborador',
  'unidad',
  'cliente',
  'puesto',
  'sueldo',
  'fecha',
  'factura',
  'concepto',
  'notas',
  'estado',
  'categoria',
  'nivel',
  'subtotal',
  'iva',
  'razon social',
  'receptor',
];

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
  'total',
];

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const HOJAS_RECOMENDADAS = [
  'sueldos por unidad',
  'mapa unidades',
  'facturacion ingresos',
  'resumen mensual',
  'aportaciones',
  'estado de cuenta',
  'conciliacion',
  'nomina',
  'empleados',
  'colaboradores',
];

function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function celdaVacia(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

function filaTieneDatos(fila) {
  return fila.some((celda) => !celdaVacia(celda));
}

function limpiarNombreColumna(valor, indice) {
  const texto = String(valor ?? '').trim();
  return texto || `Columna_${indice + 1}`;
}

function esMes(valor) {
  const norm = normalizar(valor);
  if (MESES.includes(norm)) return true;
  if (MESES_CORTOS.some((m) => norm.startsWith(m))) return true;
  if (norm.includes('proy')) return true;
  return /^\d{4}-\d{2}$/.test(norm) || norm === 'total' || /^\d{4}$/.test(norm);
}

export function esHojaMatrizMensual(nombreHoja, matriz) {
  if (normalizar(nombreHoja).includes('resumen mensual')) return true;
  if (normalizar(nombreHoja).includes('aportaciones')) return true;

  for (const fila of matriz.slice(0, 8)) {
    if (!fila) continue;
    const mesesEncontrados = fila.filter((celda) => esMes(celda)).length;
    if (mesesEncontrados >= 3) return true;
  }

  return false;
}

export function esHojaResumenMensual(nombreHoja, matriz) {
  return esHojaMatrizMensual(nombreHoja, matriz);
}

export function parsearResumenMensual(matriz) {
  let filaMeses = -1;
  const meses = [];

  for (let i = 0; i < Math.min(matriz.length, 12); i++) {
    const fila = matriz[i];
    if (!fila) continue;

    const celdas = fila.map((c) => String(c ?? '').trim());
    const indicesMeses = celdas
      .map((celda, indice) => ({ celda, indice }))
      .filter(({ celda, indice }) => indice > 0 && esMes(celda));

    if (indicesMeses.length >= 3) {
      filaMeses = i;
      for (const { celda, indice } of indicesMeses) {
        meses.push({ indice, etiqueta: celda });
      }
      break;
    }
  }

  if (filaMeses === -1 || meses.length === 0) {
    throw new Error('No se pudo detectar la estructura del resumen mensual');
  }

  const filas = [];
  let categoriaActual = '';

  for (let i = filaMeses + 1; i < matriz.length; i++) {
    const fila = matriz[i];
    if (!fila || !filaTieneDatos(fila)) continue;

    const conceptoRaw = String(fila[0] ?? '');
    const concepto = conceptoRaw.trim();
    if (!concepto) continue;

    if (normalizar(concepto) === 'concepto') continue;

    const esCategoria =
      concepto === concepto.toUpperCase() &&
      !conceptoRaw.startsWith(' ') &&
      meses.every((mes) => celdaVacia(fila[mes.indice]));

    if (esCategoria) {
      categoriaActual = concepto;
      continue;
    }

    const registro = {
      Concepto: concepto,
      Categoría: categoriaActual,
    };

    let tieneValor = false;
    for (const mes of meses) {
      const valor = fila[mes.indice] ?? '';
      registro[mes.etiqueta] = valor;
      if (!celdaVacia(valor)) tieneValor = true;
    }

    if (tieneValor) filas.push(registro);
  }

  if (filas.length === 0) {
    throw new Error('El resumen mensual no contiene filas de datos');
  }

  const columnas = ['Concepto', 'Categoría', ...meses.map((m) => m.etiqueta)];

  return {
    columnas,
    filas,
    datosEstructurados: {
      meses: meses.map((m) => m.etiqueta),
      filas,
    },
  };
}

export function listarHojas(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer' });
  return libro.SheetNames;
}

export function detectarFilaEncabezados(matriz) {
  if (esHojaResumenMensual('', matriz)) {
    return 0;
  }

  let mejorFila = 0;
  let mejorPuntuacion = -1;

  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const fila = matriz[i];
    if (!fila || !filaTieneDatos(fila)) continue;

    const celdas = fila.map((c) => String(c ?? '').trim()).filter(Boolean);
    if (celdas.length < 2) continue;

    let puntos = 0;

    for (const celda of celdas) {
      const norm = normalizar(celda);
      if (PATRONES_ENCABEZADO.some((patron) => norm.includes(patron))) {
        puntos += 3;
      }
      const numero = Number(String(celda).replace(/[$,\s]/g, ''));
      if (!Number.isFinite(numero) || norm.length > 3) {
        puntos += 1;
      }
    }

    if (puntos > mejorPuntuacion) {
      mejorPuntuacion = puntos;
      mejorFila = i;
    }
  }

  return mejorFila;
}

function matrizDesdeHoja(hoja) {
  return XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    defval: '',
    raw: false,
  });
}

function construirFilasDesdeMatriz(matriz, filaEncabezado) {
  const filaHeaders = matriz[filaEncabezado] ?? [];
  const columnas = filaHeaders.map((valor, indice) => limpiarNombreColumna(valor, indice));

  const filas = [];

  for (let i = filaEncabezado + 1; i < matriz.length; i++) {
    const filaMatriz = matriz[i];
    if (!filaMatriz || !filaTieneDatos(filaMatriz)) continue;

    const fila = {};
    let tieneValor = false;

    for (let j = 0; j < columnas.length; j++) {
      const valor = filaMatriz[j] ?? '';
      fila[columnas[j]] = valor;
      if (!celdaVacia(valor)) tieneValor = true;
    }

    if (tieneValor) filas.push(fila);
  }

  return { columnas, filas };
}

function esHojaRecomendada(nombreHoja) {
  const norm = normalizar(nombreHoja);
  return HOJAS_RECOMENDADAS.some((patron) => norm.includes(patron));
}

function esHojaConciliacion(nombreHoja) {
  return normalizar(nombreHoja).includes('conciliacion');
}

export function parsearConciliacion(nombreHoja, matriz) {
  const periodo = nombreHoja.replace(/^conciliaci[oó]n\s*/i, '').trim() || nombreHoja;
  const resumen = {};

  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const fila = matriz[i];
    if (!fila) continue;
    const etiqueta = normalizar(String(fila[0] ?? ''));

    if (etiqueta.includes('saldo inicial')) {
      resumen.saldoInicialBanco = Number(String(fila[1] ?? '').replace(/[$,\s]/g, '')) || 0;
    }
    if (etiqueta.includes('abonos') || etiqueta.includes('ingresos')) {
      resumen.abonosBanco = Number(String(fila[1] ?? '').replace(/[$,\s]/g, '')) || 0;
      resumen.abonosHoja = Number(String(fila[2] ?? '').replace(/[$,\s]/g, '')) || 0;
      resumen.diferenciaAbonos = Number(String(fila[3] ?? '').replace(/[$,\s]/g, '')) || 0;
    }
    if (etiqueta.includes('cargos') || etiqueta.includes('egresos')) {
      resumen.cargosBanco = Number(String(fila[1] ?? '').replace(/[$,\s]/g, '')) || 0;
      resumen.cargosHoja = Number(String(fila[2] ?? '').replace(/[$,\s]/g, '')) || 0;
      resumen.diferenciaCargos = Number(String(fila[3] ?? '').replace(/[$,\s]/g, '')) || 0;
    }
    if (etiqueta.includes('saldo final')) {
      resumen.saldoFinalBanco = Number(String(fila[1] ?? '').replace(/[$,\s]/g, '')) || 0;
    }
  }

  let filaEncabezado = -1;
  for (let i = 0; i < Math.min(matriz.length, 25); i++) {
    if (normalizar(String(matriz[i]?.[0] ?? '')) === 'fecha') {
      filaEncabezado = i;
      break;
    }
  }

  if (filaEncabezado === -1) {
    throw new Error('No se encontró la tabla de movimientos en la conciliación');
  }

  const { columnas, filas } = construirFilasDesdeMatriz(matriz, filaEncabezado);

  return {
    filaEncabezado: filaEncabezado + 1,
    columnas,
    filas,
    datosEstructurados: { periodo, resumen },
  };
}

function parsearContenidoHoja(nombreHoja, matriz) {
  if (esHojaConciliacion(nombreHoja)) {
    return parsearConciliacion(nombreHoja, matriz);
  }

  if (esHojaMatrizMensual(nombreHoja, matriz)) {
    const resultado = parsearResumenMensual(matriz);
    return {
      filaEncabezado: 1,
      columnas: resultado.columnas,
      filas: resultado.filas,
      datosEstructurados: resultado.datosEstructurados,
    };
  }

  const filaEncabezado = detectarFilaEncabezados(matriz);
  const { columnas, filas } = construirFilasDesdeMatriz(matriz, filaEncabezado);

  return {
    filaEncabezado: filaEncabezado + 1,
    columnas,
    filas,
    datosEstructurados: null,
  };
}

export function previsualizarHoja(buffer, nombreHoja) {
  const libro = XLSX.read(buffer, { type: 'buffer' });

  if (!libro.SheetNames.includes(nombreHoja)) {
    throw new Error(`La hoja "${nombreHoja}" no existe en el archivo`);
  }

  const hoja = libro.Sheets[nombreHoja];
  const matriz = matrizDesdeHoja(hoja);
  const { filaEncabezado, columnas, filas } = parsearContenidoHoja(nombreHoja, matriz);

  return {
    nombreHoja,
    filaEncabezado,
    columnas,
    totalFilas: filas.length,
    muestraFilas: filas.slice(0, 5),
    recomendada: esHojaRecomendada(nombreHoja),
  };
}

export function previsualizarLibro(buffer) {
  const hojas = listarHojas(buffer);

  const previsualizaciones = hojas.map((nombre) => {
    try {
      return previsualizarHoja(buffer, nombre);
    } catch {
      return {
        nombreHoja: nombre,
        filaEncabezado: 1,
        columnas: [],
        totalFilas: 0,
        muestraFilas: [],
        recomendada: esHojaRecomendada(nombre),
      };
    }
  });

  const hojaSugerida =
    previsualizaciones.find((h) => h.recomendada && h.totalFilas > 0)?.nombreHoja ??
    previsualizaciones.find((h) => h.totalFilas > 0)?.nombreHoja ??
    hojas[0];

  return {
    hojas: previsualizaciones,
    hojaSugerida,
  };
}

export function parsearExcel(buffer, opciones = {}) {
  const { nombreHoja } = opciones;
  const libro = XLSX.read(buffer, { type: 'buffer' });
  const hojaSeleccionada = nombreHoja ?? libro.SheetNames[0];

  if (!hojaSeleccionada) {
    throw new Error('El archivo Excel no contiene hojas');
  }

  if (!libro.SheetNames.includes(hojaSeleccionada)) {
    throw new Error(`La hoja "${hojaSeleccionada}" no existe en el archivo`);
  }

  const hoja = libro.Sheets[hojaSeleccionada];
  const matriz = matrizDesdeHoja(hoja);
  const { filaEncabezado, columnas, filas, datosEstructurados } = parsearContenidoHoja(
    hojaSeleccionada,
    matriz
  );

  if (filas.length === 0) {
    throw new Error('La hoja seleccionada no contiene datos tabulares');
  }

  return {
    nombreHoja: hojaSeleccionada,
    filaEncabezado,
    columnas,
    filas,
    totalFilas: filas.length,
    datosEstructurados,
    hojasDisponibles: libro.SheetNames,
  };
}

export function generarExcel({ nombreHoja = 'Datos', columnas, filas }) {
  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}
