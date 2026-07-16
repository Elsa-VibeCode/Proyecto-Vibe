export type BadgeSicofi = 'NUEVA' | 'DUPLICADO' | 'SIN_CLASIFICAR' | 'ERROR' | 'OMITIDA';

export type EstrategiaDuplicados = 'ignorar' | 'actualizarVacios' | 'sobrescribir';

export interface SicofiMapping {
  fechaFacturacion: string | null;
  noFactura: string | null;
  noFacturaTipo: 'serie_folio' | 'columna';
  serie: string | null;
  folio: string | null;
  cliente: string | null;
  concepto: string | null;
  subtotal: string | null;
  iva: string | null;
  total: string | null;
  metodoPago: string | null;
  estatusSat: string | null;
  uuid: string | null;
  rfcEmisorCol: string | null;
  tipoComprobante: string | null;
}

export interface SicofiDefaults {
  fechaPago: 'vacio' | 'fechaFacturacion';
  estatusPago: 'PENDIENTE' | 'PAGADO' | 'metodo_pago';
  rfcEmisor: 'GBL' | 'GAVM' | 'columna' | string;
  unidad: 'auto' | 'vacia';
}

export interface SicofiPreviewFila {
  fila: number;
  badge: BadgeSicofi;
  mensaje?: string;
  sinClasificar?: boolean;
  noFactura?: string;
  cliente?: string;
  concepto?: string;
  subtotal?: number;
  iva?: number;
  total?: number;
  fechaFacturacion?: string;
  estatusEnvio?: string;
  estatusPago?: string;
  uuid?: string;
  unidad?: string | null;
}

export interface SicofiPreviewResponse {
  ok: boolean;
  data: {
    columnasDetectadas: string[];
    delimitador: string;
    encoding: string;
    primeras5Filas: Record<string, string>[];
    mappingSugerido: SicofiMapping;
    mapping: SicofiMapping;
    defaults: SicofiDefaults;
    defaultsSugeridos: SicofiDefaults;
    camposSinMapping: string[];
    preview: SicofiPreviewFila[];
    contadores: Record<BadgeSicofi, number>;
    totalFilas: number;
    previewLimitado: boolean;
    csvBase64: string;
  };
}

export interface SicofiImportResponse {
  ok: boolean;
  data: {
    totalFilas: number;
    creadas: number;
    actualizadas: number;
    ignoradas: number;
    omitidas: number;
    sinClasificar?: number;
    errores: { fila: number; mensaje: string }[];
    logId: string;
  };
}

export interface SicofiMappingGuardado {
  mapping: SicofiMapping;
  defaults: SicofiDefaults;
  guardadoEn: string;
}

const STORAGE_KEY = 'adminsys-sicofi-mapping';

export function cargarMappingSicofiGuardado(): SicofiMappingGuardado | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SicofiMappingGuardado) : null;
  } catch {
    return null;
  }
}

export function guardarMappingSicofi(mapping: SicofiMapping, defaults: SicofiDefaults) {
  if (typeof localStorage === 'undefined') return;
  const payload: SicofiMappingGuardado = {
    mapping,
    defaults,
    guardadoEn: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export const CAMPOS_MAPPING_UI: { key: keyof SicofiMapping; label: string; requerido?: boolean }[] = [
  { key: 'fechaFacturacion', label: 'Fecha de facturación', requerido: true },
  { key: 'serie', label: 'Serie (para noFactura)' },
  { key: 'folio', label: 'Folio (para noFactura)', requerido: true },
  { key: 'cliente', label: 'Cliente', requerido: true },
  { key: 'concepto', label: 'Concepto', requerido: true },
  { key: 'subtotal', label: 'Subtotal', requerido: true },
  { key: 'iva', label: 'IVA' },
  { key: 'total', label: 'Total' },
  { key: 'metodoPago', label: 'Método de pago' },
  { key: 'estatusSat', label: 'Estatus SAT' },
  { key: 'uuid', label: 'UUID fiscal' },
  { key: 'rfcEmisorCol', label: 'RFC emisor (columna)' },
  { key: 'tipoComprobante', label: 'Tipo comprobante (I/P)' },
];
