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
  filas?: Record<string, unknown>[];
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
