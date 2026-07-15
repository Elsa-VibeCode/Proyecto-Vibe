export const ESTADOS_RESULTADO = [
  'ADMINISTRATIVO',
  'OPERATIVO',
  'COMERCIAL',
  'FINANCIERO',
] as const;
export type EstadoResultado = (typeof ESTADOS_RESULTADO)[number];

export const UNIDADES = ['Grupo', 'Consulting', 'Technologies', 'Todos'] as const;
export type Unidad = (typeof UNIDADES)[number];

export const METODOS_PAGO = [
  'TRANSFERENCIA',
  'EFECTIVO',
  'TARJETA',
  'SPEI',
  'CHEQUE',
  'DOMICILIACION',
  'OTRO',
] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const TIPOS_IMPUESTO = ['IVA_16', 'IVA_8', 'EXENTO', 'CERO', 'ISR_RETENIDO'] as const;
export type TipoImpuesto = (typeof TIPOS_IMPUESTO)[number];

// Debe coincidir con FACTORES_IMPUESTO del backend (models/Egreso.js).
export const FACTORES_IMPUESTO: Record<TipoImpuesto, number> = {
  IVA_16: 0.16,
  IVA_8: 0.08,
  EXENTO: 0,
  CERO: 0,
  ISR_RETENIDO: -0.10467,
};

export interface Egreso {
  _id?: string;
  fechaGasto: string;
  proyecto?: string;
  estadoResultado: EstadoResultado;
  unidad: Unidad;
  tipoGasto: string;
  tipoSubgasto?: string;
  metodoPago?: MetodoPago | '';
  noFactura?: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  tipoImpuesto: TipoImpuesto;
  impuesto?: number;
  total?: number;
  mes?: string;
  esTransferLatam?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Paginacion {
  total: number;
  pagina: number;
  limite: number;
  paginas: number;
}

export interface TotalesUnidad {
  grupo: number;
  consulting: number;
  technologies: number;
  total: number;
}

export interface TipoGasto {
  _id: string;
  nombre: string;
  activo: boolean;
  orden?: number;
}

export function calcularMontos(subtotal: number, tipoImpuesto: TipoImpuesto) {
  const base = Number(subtotal) || 0;
  const factor = FACTORES_IMPUESTO[tipoImpuesto] ?? 0;
  const impuesto = Math.round(base * factor * 100) / 100;
  const total = Math.round((base + impuesto) * 100) / 100;
  return { impuesto, total };
}
