export type CampoRh =
  | 'puesto'
  | 'nivelPuesto'
  | 'categoria'
  | 'tiempoPuesto'
  | 'sueldo'
  | 'seguroMedico';

export interface MapeoColumnas {
  puesto: string | null;
  nivelPuesto: string | null;
  categoria: string | null;
  tiempoPuesto: string | null;
  sueldo: string | null;
  seguroMedico: string | null;
}

export interface FiltrosRh {
  puesto: string;
  nivelPuesto: string;
  categoria: string;
  tiempoMin: string;
  tiempoMax: string;
  sueldoMin: string;
  sueldoMax: string;
  seguroMedico: string;
}

export interface ResumenNivel {
  nivel: string;
  empleados: number;
  sueldoPromedio: number;
  sueldoMin: number;
  sueldoMax: number;
  conSeguro: number;
}

export interface ResumenPuesto {
  puesto: string;
  empleados: number;
  sueldoPromedio: number;
  sueldoMin: number;
  sueldoMax: number;
  conSeguro: number;
}

const ORDEN_CAMPOS: CampoRh[] = [
  'tiempoPuesto',
  'nivelPuesto',
  'seguroMedico',
  'puesto',
  'categoria',
  'sueldo',
];

const PATRONES: Record<CampoRh, string[]> = {
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

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function detectarColumnas(columnas: string[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {
    puesto: null,
    nivelPuesto: null,
    categoria: null,
    tiempoPuesto: null,
    sueldo: null,
    seguroMedico: null,
  };

  const usadas = new Set<string>();
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

export function parsearNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const limpio = String(valor).replace(/[$,\s]/g, '').trim();
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

export function parsearTiempoMeses(valor: unknown): number | null {
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

export function parsearSeguro(valor: unknown): boolean | null {
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

export function obtenerValor(fila: Record<string, unknown>, columna: string | null): unknown {
  if (!columna) return null;
  return fila[columna];
}

export function filtrarFilas(
  filas: Record<string, unknown>[],
  mapeo: MapeoColumnas,
  filtros: FiltrosRh
): Record<string, unknown>[] {
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

export function valoresUnicos(
  filas: Record<string, unknown>[],
  columna: string | null
): string[] {
  if (!columna) return [];

  const valores = new Set<string>();
  for (const fila of filas) {
    const valor = String(obtenerValor(fila, columna) ?? '').trim();
    if (valor) valores.add(valor);
  }

  return [...valores].sort((a, b) => a.localeCompare(b, 'es'));
}

export function calcularResumenNiveles(
  filas: Record<string, unknown>[],
  mapeo: MapeoColumnas
): ResumenNivel[] {
  if (!mapeo.nivelPuesto) return [];

  const grupos = new Map<string, { sueldos: number[]; conSeguro: number; empleados: number }>();

  for (const fila of filas) {
    const nivel = String(obtenerValor(fila, mapeo.nivelPuesto) ?? 'Sin nivel').trim() || 'Sin nivel';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (!grupos.has(nivel)) {
      grupos.set(nivel, { sueldos: [], conSeguro: 0, empleados: 0 });
    }

    const grupo = grupos.get(nivel)!;
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

export function calcularResumenPuestos(
  filas: Record<string, unknown>[],
  mapeo: MapeoColumnas
): ResumenPuesto[] {
  if (!mapeo.puesto) return [];

  const grupos = new Map<string, { sueldos: number[]; conSeguro: number; empleados: number }>();

  for (const fila of filas) {
    const puesto = String(obtenerValor(fila, mapeo.puesto) ?? 'Sin puesto').trim() || 'Sin puesto';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (!grupos.has(puesto)) {
      grupos.set(puesto, { sueldos: [], conSeguro: 0, empleados: 0 });
    }

    const grupo = grupos.get(puesto)!;
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

export function filtrosVacios(): FiltrosRh {
  return {
    puesto: '',
    nivelPuesto: '',
    categoria: '',
    tiempoMin: '',
    tiempoMax: '',
    sueldoMin: '',
    sueldoMax: '',
    seguroMedico: '',
  };
}

export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(valor);
}
