export type UnidadComplemento = 'Consulting' | 'Technologies' | 'Grupo';
export type MonedaComplemento = 'MXN' | 'USD' | 'EUR';
export type FormaPagoSat = '01' | '02' | '03' | '04' | '28' | '99';
export type OrigenComplemento = 'manual' | 'sicofi_import';

export const UNIDADES_COMPLEMENTO: UnidadComplemento[] = ['Consulting', 'Technologies', 'Grupo'];
export const MONEDAS_COMPLEMENTO: MonedaComplemento[] = ['MXN', 'USD', 'EUR'];
export const FORMAS_PAGO_SAT: { value: FormaPagoSat; label: string }[] = [
  { value: '01', label: '01 — Efectivo' },
  { value: '02', label: '02 — Cheque nominativo' },
  { value: '03', label: '03 — Transferencia' },
  { value: '04', label: '04 — Tarjeta de crédito' },
  { value: '28', label: '28 — Tarjeta de débito' },
  { value: '99', label: '99 — Por definir' },
];

export interface FacturaRelacionadaPayload {
  facturaId: string;
  importePagado: number;
}

export interface ComplementoPayload {
  folio: string;
  fechaEmision: string;
  fechaPago: string;
  monto: number;
  moneda?: MonedaComplemento;
  formaPago?: FormaPagoSat;
  unidad?: UnidadComplemento;
  cliente?: string;
  uuid?: string;
  observaciones?: string;
  facturasRelacionadas: FacturaRelacionadaPayload[];
}

export interface FacturaRelacionada extends FacturaRelacionadaPayload {
  noFactura?: string;
  uuidFactura?: string;
  numParcialidad?: number;
  saldoAnterior?: number;
  saldoInsoluto?: number;
  monedaP?: string;
}

export interface Complemento extends ComplementoPayload {
  _id: string;
  origen?: OrigenComplemento;
  createdAt?: string;
  updatedAt?: string;
  facturasRelacionadas: FacturaRelacionada[];
}

export interface PaginacionComplementos {
  total: number;
  pagina: number;
  limite: number;
  paginas: number;
}

export interface FacturaPpdDisponible {
  _id: string;
  noFactura: string;
  cliente: string;
  total: number;
  montoPagado: number;
  saldoPendiente?: number;
  fechaPago?: string;
  uuid?: string;
  unidad?: UnidadComplemento;
  estatusComplemento?: string;
}

export type BadgeRep = 'NUEVO' | 'DUPLICADO' | 'ERROR' | 'SIN_FACTURA';

export interface RepPreviewFila {
  fila: number;
  uuid?: string;
  folio?: string;
  cliente?: string;
  fechaEmision?: string;
  fechaPago?: string;
  monto?: number;
  uuidFacturaRel?: string;
  badge: BadgeRep | string;
  mensaje?: string;
  facturaId?: string;
  noFacturaRel?: string;
}

export interface RepPreviewResponse {
  ok: boolean;
  data: {
    columnas: string[];
    mapping: Record<string, string | null>;
    encoding: string;
    colUuidRelacionado: string | null;
    preview: RepPreviewFila[];
    contadores: Record<string, number>;
    totalFilas: number;
  };
}

export interface RepImportResponse {
  ok: boolean;
  data: {
    importados: number;
    omitidos: number;
    alertas: string[];
    contadores: Record<string, number>;
  };
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
}
