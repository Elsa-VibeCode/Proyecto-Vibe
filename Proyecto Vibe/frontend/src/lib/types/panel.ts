export type PanelVista = 'cobro' | 'facturacion';

export interface PanelArrastres {
  count: number;
  monto: number;
  mesOrigen: string;
  folios: { folio: string; cliente: string; total: number; mesOrigen: string }[];
  grupos?: { mesOrigen: string; count: number; monto: number; folios: PanelArrastres['folios'] }[];
}

export interface PanelConfig {
  aporteConsultingPct: number;
  fechaVigenciaRegla: string;
  latamKonfioMensual: number;
  reglaAplica: boolean;
}

export interface PanelConsulting {
  facturado: number;
  pagado: number;
  pendiente: number;
  aporte10pct: number;
  numFacturas: number;
  numPagadas?: number;
  numPendientes?: number;
  pctPagado: number;
  deltaFacturadoMesAnterior?: number | null;
  arrastres?: PanelArrastres | null;
}

export interface PanelTechnologies {
  facturado: number;
  facturadoBBVA: number;
  facturadoFueraBBVA: number;
  pagado: number;
  pendiente: number;
  recibe10pct: number;
  reservaAcumulada: number;
  numFacturas: number;
  numPagadas?: number;
  numPendientes?: number;
  pctPagado: number;
  deltaFacturadoMesAnterior?: number | null;
  arrastres?: PanelArrastres | null;
}

export interface PanelGrupo {
  egresosTotal: number;
  recibio10pct: number;
  deficitMes: number;
  cobertura: { consulting: number; technologies: number };
  deltaEgresosMesAnterior?: number | null;
}

export interface PanelAlerta {
  tipo: string;
  urgencia: 'alta' | 'media' | 'baja';
  count?: number;
  monto?: number;
  descripcion: string;
  enlace?: string;
}

export interface PanelChartMes {
  mes: string;
  consultingIngreso: number;
  techBBVA: number;
  techFuera: number;
  egresosTotal: number;
}

export interface PanelSaldo {
  unidad: string;
  etiqueta: string;
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  movInternos: number;
  movInternosEtiqueta: string;
  saldoFinal: number;
}

export interface PanelRegla10 {
  aporteConsultingPct: number;
  fechaVigenciaRegla: string;
  reglaAplica: boolean;
  consultingPagado: number;
  aporteEsperado: number;
  egresosGrupo: number;
  coberturaPct: number;
  gapTechnologies: number;
}

export interface PanelData {
  mes: string;
  vista: PanelVista;
  actualizadoEn: string;
  sinDatos: boolean;
  config: PanelConfig;
  regla10: PanelRegla10;
  unidades: {
    consulting: PanelConsulting;
    technologies: PanelTechnologies;
    grupo: PanelGrupo;
  };
  alertas: PanelAlerta[];
  chart6meses: PanelChartMes[];
  chart12meses: PanelChartMes[];
  saldos: PanelSaldo[];
  saldosYtd: PanelSaldo[];
  desdeCache?: boolean;
}

export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split('-');
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${nombres[Number(m) - 1]} ${y}`;
}

export function pctTexto(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}

export function deltaPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (actual - anterior) / anterior;
}

export function textoDelta(delta: number | null | undefined, esGasto = false): string {
  if (delta === null || delta === undefined) return '';
  const pct = Math.abs(delta * 100).toFixed(1);
  const flecha = delta >= 0 ? '▲' : '▼';
  return `${flecha} ${delta >= 0 ? '+' : '-'}${pct}% vs mes anterior`;
}

export function deltaEsPositivo(delta: number | null | undefined, esGasto = false): boolean {
  if (delta === null || delta === undefined) return false;
  return esGasto ? delta < 0 : delta >= 0;
}

/** Formato $1,234.56 para el Panel (2 decimales). */
export function formatearMonedaPanel(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

const STORAGE_VISTA = 'panel-vista';

export function cargarVistaPanel(): PanelVista {
  if (typeof localStorage === 'undefined') return 'cobro';
  const v = localStorage.getItem(STORAGE_VISTA);
  return v === 'facturacion' ? 'facturacion' : 'cobro';
}

export function guardarVistaPanel(vista: PanelVista) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_VISTA, vista);
}

export function tooltipArrastres(arr: PanelArrastres | null | undefined): string {
  if (!arr?.folios?.length) return '';
  return arr.folios
    .map((f) => `${f.folio} · ${f.cliente} · ${formatearMonedaPanel(f.total)} (emitida ${f.mesOrigen})`)
    .join('\n');
}

export function etiquetaArrastres(arr: PanelArrastres | null | undefined): string {
  if (!arr?.count) return '';
  const mesLabel = arr.mesOrigen ? etiquetaMes(arr.mesOrigen) : 'meses previos';
  return `↳ Incluye ${arr.count} arrastre${arr.count === 1 ? '' : 's'} de ${mesLabel} (${formatearMonedaPanel(arr.monto)})`;
}
