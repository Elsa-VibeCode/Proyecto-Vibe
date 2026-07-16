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
  numPagadas: number;
  numPendientes: number;
  pctPagado: number;
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
  pctPagado: number;
}

export interface PanelGrupo {
  egresosTotal: number;
  recibio10pct: number;
  deficitMes: number;
  cobertura: { consulting: number; technologies: number };
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

/** Formato $1,234.56 para el Panel (2 decimales). */
export function formatearMonedaPanel(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}
