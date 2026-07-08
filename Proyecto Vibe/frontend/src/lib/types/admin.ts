export interface ResumenFacturacion {
  totalFacturado: number;
  totalPagado: number;
  totalPendiente: number;
  facturas: number;
  porCliente: { nombre: string; facturas: number; monto: number }[];
  porArea: { nombre: string; facturas: number; monto: number }[];
  porEstatus: { nombre: string; facturas: number; monto: number }[];
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
  finanzas?: ResumenFinanzas;
  estadoCuenta?: ResumenEstadoCuenta;
  conciliacion?: ResumenConciliacion;
  filas?: Record<string, unknown>[];
}

export interface ResumenEstadoCuenta {
  movimientos: number;
  totalIngresos: number;
  totalEgresos: number;
  saldoFinal: number;
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
}

export function filtrosFacturacionVacios(): FiltrosFacturacion {
  return {
    cliente: '',
    areaVenta: '',
    estatusPago: '',
    totalMin: '',
    totalMax: '',
  };
}
