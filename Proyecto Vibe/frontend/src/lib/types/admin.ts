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

export type TipoNomina = 'honorarios_por_proyecto' | 'sueldo_y_comisiones' | 'honorarios_externos';

export interface Colaborador {
  _id: string;
  nombre: string;
  unidadBase: 'Consulting' | 'Technologies' | 'Grupo';
  tipoRelacion: 'socio' | 'colaborador' | 'honorarios_externos';
  tipoNomina: TipoNomina;
  notas?: string;
}

export interface NominaPago {
  _id: string;
  colaborador: string;
  monto: number;
  fecha: string;
  periodo: string;
  concepto?: string;
  responsableTransferencia?: string;
  unidadClasificada: 'Consulting' | 'Technologies' | 'Grupo' | 'sin_clasificar';
  estadoClasificacion: 'auto_confirmado' | 'manual' | 'no_encontrado';
  unidadManual?: boolean;
  montoClasificadoBase?: number;
}

export interface ResumenClasificacionNomina {
  total: number;
  autoConfirmado: number;
  manual: number;
  noEncontrado: number;
  montoTotal: number;
  montoPorUnidad: Record<string, number>;
}

export interface ResumenNominaMensual {
  meses: string[];
  porUnidad: { unidad: string; porMes: Record<string, number>; total: number }[];
  totalPorMes: Record<string, number>;
  granTotal: number;
}

export interface ResumenNomina {
  pagos: NominaPago[];
  clasificacion: ResumenClasificacionNomina;
  resumenMensual: ResumenNominaMensual;
  total: number;
}

export interface IngresoMes {

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
