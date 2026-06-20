const ORDEN_CAMPOS = [
  'tiempoPuesto',
  'nivelPuesto',
  'seguroMedico',
  'puesto',
  'categoria',
  'sueldo',
];

const PATRONES = {
  puesto: ['puesto', 'cargo', 'titulo del puesto', 'título del puesto', 'posicion', 'posición', 'job title', 'rol'],
  nivelPuesto: ['nivel de puesto', 'nivel puesto', 'puesto nivel', 'level', 'grado', 'nivel'],
  categoria: ['categoria', 'categoría', 'category', 'departamento', 'area', 'área', 'division'],
  tiempoPuesto: [
    'tiempo en el puesto',
    'tiempo en puesto',
    'tiempo puesto',
    'antiguedad',
    'antigüedad',
    'años en puesto',
    'meses en puesto',
  ],
  sueldo: ['sueldo', 'salario', 'salary', 'pago mensual', 'compensacion', 'compensación', 'ingreso'],
  seguroMedico: [
    'seguro de gastos medicos',
    'seguro de gastos médicos',
    'seguro medico',
    'seguro médico',
    'gmm',
    'gastos medicos',
    'gastos médicos',
  ],
};

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function detectarColumnas(columnas) {
  const mapeo = {
    puesto: null,
    nivelPuesto: null,
    categoria: null,
    tiempoPuesto: null,
    sueldo: null,
    seguroMedico: null,
  };

  const usadas = new Set();
  const normalizadas = columnas.map((c) => ({ original: c, norm: normalizar(c) }));

  for (const campo of ORDEN_CAMPOS) {
    for (const patron of PATRONES[campo]) {
      const patronNorm = normalizar(patron);
      const encontrada = normalizadas.find(
        (c) =>
          !usadas.has(c.original) &&
          (c.norm === patronNorm || c.norm.includes(patronNorm))
      );

      if (encontrada) {
        mapeo[campo] = encontrada.original;
        usadas.add(encontrada.original);
        break;
      }
    }
  }

  return mapeo;
}

export function parsearNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const limpio = String(valor).replace(/[$,\s]/g, '').trim();
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

export function parsearTiempoMeses(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  const texto = normalizar(String(valor));
  const matchAnios = texto.match(/(\d+(?:\.\d+)?)\s*(años|anos|year|yr)/);
  if (matchAnios) return Math.round(Number(matchAnios[1]) * 12);

  const matchMeses = texto.match(/(\d+(?:\.\d+)?)\s*(meses|mes|month|m)/);
  if (matchMeses) return Math.round(Number(matchMeses[1]));

  const soloNumero = parsearNumero(valor);
  if (soloNumero !== null) {
    return soloNumero <= 50 ? Math.round(soloNumero * 12) : Math.round(soloNumero);
  }

  return null;
}

export function parsearSeguro(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  const texto = normalizar(String(valor));

  if (['si', 'sí', 'yes', 'true', '1', 'activo', 'incluido', 'con seguro'].includes(texto)) {
    return true;
  }

  if (['no', 'false', '0', 'sin seguro', 'no aplica', 'n/a'].includes(texto)) {
    return false;
  }

  return null;
}

function obtenerValor(fila, columna) {
  if (!columna) return null;
  return fila[columna];
}

export function filtrarFilas(filas, mapeo, filtros = {}) {
  const sueldoMin = filtros.sueldoMin ? Number(filtros.sueldoMin) : null;
  const sueldoMax = filtros.sueldoMax ? Number(filtros.sueldoMax) : null;
  const tiempoMin = filtros.tiempoMin ? Number(filtros.tiempoMin) : null;
  const tiempoMax = filtros.tiempoMax ? Number(filtros.tiempoMax) : null;

  return filas.filter((fila) => {
    const puesto = String(obtenerValor(fila, mapeo.puesto) ?? '').trim();
    const nivel = String(obtenerValor(fila, mapeo.nivelPuesto) ?? '').trim();
    const categoria = String(obtenerValor(fila, mapeo.categoria) ?? '').trim();
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const tiempo = parsearTiempoMeses(obtenerValor(fila, mapeo.tiempoPuesto));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (filtros.puesto && puesto !== filtros.puesto) return false;
    if (filtros.nivelPuesto && nivel !== filtros.nivelPuesto) return false;
    if (filtros.categoria && categoria !== filtros.categoria) return false;
    if (sueldoMin !== null && (sueldo === null || sueldo < sueldoMin)) return false;
    if (sueldoMax !== null && (sueldo === null || sueldo > sueldoMax)) return false;
    if (tiempoMin !== null && (tiempo === null || tiempo < tiempoMin)) return false;
    if (tiempoMax !== null && (tiempo === null || tiempo > tiempoMax)) return false;
    if (filtros.seguroMedico === 'si' && seguro !== true) return false;
    if (filtros.seguroMedico === 'no' && seguro !== false) return false;

    return true;
  });
}

export function calcularResumenNiveles(filas, mapeo) {
  if (!mapeo.nivelPuesto) return [];

  const grupos = new Map();

  for (const fila of filas) {
    const nivel = String(obtenerValor(fila, mapeo.nivelPuesto) ?? 'Sin nivel').trim() || 'Sin nivel';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (!grupos.has(nivel)) {
      grupos.set(nivel, { sueldos: [], conSeguro: 0, empleados: 0 });
    }

    const grupo = grupos.get(nivel);
    grupo.empleados += 1;
    if (sueldo !== null) grupo.sueldos.push(sueldo);
    if (seguro === true) grupo.conSeguro += 1;
  }

  return [...grupos.entries()]
    .map(([nivel, datos]) => {
      const promedio =
        datos.sueldos.length > 0
          ? datos.sueldos.reduce((a, b) => a + b, 0) / datos.sueldos.length
          : 0;

      return {
        nivel,
        empleados: datos.empleados,
        sueldoPromedio: Math.round(promedio),
        sueldoMin: datos.sueldos.length ? Math.min(...datos.sueldos) : 0,
        sueldoMax: datos.sueldos.length ? Math.max(...datos.sueldos) : 0,
        conSeguro: datos.conSeguro,
      };
    })
    .sort((a, b) => b.sueldoPromedio - a.sueldoPromedio);
}

export function calcularResumenPuestos(filas, mapeo) {
  if (!mapeo.puesto) return [];

  const grupos = new Map();

  for (const fila of filas) {
    const puesto = String(obtenerValor(fila, mapeo.puesto) ?? 'Sin puesto').trim() || 'Sin puesto';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (!grupos.has(puesto)) {
      grupos.set(puesto, { sueldos: [], conSeguro: 0, empleados: 0 });
    }

    const grupo = grupos.get(puesto);
    grupo.empleados += 1;
    if (sueldo !== null) grupo.sueldos.push(sueldo);
    if (seguro === true) grupo.conSeguro += 1;
  }

  return [...grupos.entries()]
    .map(([puesto, datos]) => {
      const promedio =
        datos.sueldos.length > 0
          ? datos.sueldos.reduce((a, b) => a + b, 0) / datos.sueldos.length
          : 0;

      return {
        puesto,
        empleados: datos.empleados,
        sueldoPromedio: Math.round(promedio),
        sueldoMin: datos.sueldos.length ? Math.min(...datos.sueldos) : 0,
        sueldoMax: datos.sueldos.length ? Math.max(...datos.sueldos) : 0,
        conSeguro: datos.conSeguro,
      };
    })
    .sort((a, b) => b.sueldoPromedio - a.sueldoPromedio);
}
