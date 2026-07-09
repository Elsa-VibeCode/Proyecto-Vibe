export interface ResumenFacturacion {
  totalFacturado: number;
  totalPagado: number;
  totalPendiente: number;
  facturas: number;
  porCliente: { nombre: string; facturas: number; monto: number }[];
  porArea: { nombre: string; facturas: number; monto: number }[];
  porUnidad?: { nombre: string; facturas: number; monto: number }[];
  porEstatus: { nombre: string; facturas: number; monto: number }[];
}

export interface ResumenClasificacionFacturacion {
  total: number;
  autoConfirmado: number;
  porConfirmar: number;
  noEncontrado: number;
  cancelados: number;
  activos: number;
}

export interface ClasificacionFacturacionInfo {
  resumen: ResumenClasificacionFacturacion;
  mapaCargado: boolean;
}

export interface MapaUnidad {
  _id: string;
  clienteRazonSocial: string;
  unidad: 'Consulting' | 'Technologies' | 'Grupo';
  estado: 'confirmado' | 'por_confirmar';
  notas?: string;
  actualizadoEn?: string;
}

export interface MapaProveedor {
  _id: string;
  rfcEmisor?: string;
  razonSocial: string;
  unidad: 'Consulting' | 'Technologies' | 'Grupo';
  estado: 'confirmado' | 'por_confirmar';
  notas?: string;
  actualizadoEn?: string;
}

export interface IngresoMes {
  mes: string;
  ingresos: number;
  neto: number;
  porcentaje: number;
}

export interface ResumenFinanzas {
  meses: string[];
  columnaTotal: string;
  totalIngresos: number;
  netoUltimoMes: number;
  netoAcumulado: number;
  ingresosPorMes: IngresoMes[];
  egresosPorUnidad?: {
    unidad: string;
    etiqueta: string;
    total: number;
    porMes: Record<string, number>;
  }[];
  conceptos: Record<string, unknown>[];
}

export interface ImportacionResumen {
  id: string;
  nombreArchivo: string;
  nombreHoja: string;
  totalFilas: number;
  createdAt?: string;
}

export interface ResumenModulo {
  mapeo: Record<string, string | null>;
  tipoHoja: string;
  totalFilas: number;
  importacion: ImportacionResumen;
  facturacion?: ResumenFacturacion;
  clasificacionFacturacion?: ClasificacionFacturacionInfo;
  finanzas?: ResumenFinanzas;
  estadoCuenta?: ResumenEstadoCuenta;
  conciliacion?: ResumenConciliacion;
  conciliacionesDisponibles?: ConciliacionPeriodo[];
  aportacionesGrupo?: ResumenAportacionesGrupo;
  filas?: Record<string, unknown>[];
}

export interface MesAportacion {
  mes: string;
  egresosGrupo: number;
  aporte10Consulting: number;
  gapPorCubrir: number;
  aporteConsulting: number;
  aporteTechnologies: number;
  consumoGrupo: number;
  porcentajeCobertura: number;
  faltantePorCubrir: number;
}

export interface ResumenAportacionesGrupo {
  fuente: string;
  meses: string[];
  mesActual: string;
  historialMensual: MesAportacion[];
  actual: MesAportacion | null;
  porUnidad: {
    unidad: string;
    color: string;
    historial: { mes: string; monto: number }[];
  }[];
}

export interface ResumenEstadoCuenta {
  movimientos: number;
  totalIngresos: number;
  totalEgresos: number;
  saldoFinal: number;
  nominaReclasificada?: number;
  usaMapaSueldos?: boolean;
  porUnidad: { unidad: string; movimientos: number; ingresos: number; egresos: number }[];
}

export interface ResumenConciliacion {
  periodo: string;
  saldoInicialBanco: number;
  abonosBanco: number;
  abonosHoja: number;
  diferenciaAbonos: number;
  cargosBanco: number;
  cargosHoja: number;
  diferenciaCargos: number;
  saldoFinalBanco: number;
  movimientos: number;
  conFactura: number;
  sinFactura: number;
  totalCargos: number;
  totalAbonos: number;
}

export interface ConciliacionPeriodo {
  periodo: string;
  id: string;
  nombreArchivo: string;
  nombreHoja: string;
  totalFilas: number;
  createdAt?: string;
  saldoFinalBanco: number | null;
  diferenciaCargos: number | null;
  diferenciaAbonos: number | null;
}

export interface FiltrosEstadoCuenta {
  unidad: string;
}

export interface FiltrosConciliacion {
  enFacturas: string;
}

export function filtrosEstadoCuentaVacios(): FiltrosEstadoCuenta {
  return { unidad: '' };
}

export function filtrosConciliacionVacios(): FiltrosConciliacion {
  return { enFacturas: '' };
}

export interface FiltrosFacturacion {
  cliente: string;
  areaVenta: string;
  estatusPago: string;
  totalMin: string;
  totalMax: string;
  soloSinClasificar: string;
  estadoClasificacion: string;
}

export function filtrosFacturacionVacios(): FiltrosFacturacion {
  return {
    cliente: '',
    areaVenta: '',
    estatusPago: '',
    totalMin: '',
    totalMax: '',
    soloSinClasificar: '',
    estadoClasificacion: '',
  };
}
