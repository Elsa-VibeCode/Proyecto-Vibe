/** Tipos del módulo Consultoría (BWConsulting). */

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export type UbicacionConsultoria =
  | 'BAJA_CALIFORNIA'
  | 'CUU'
  | 'JRZ'
  | 'MEOQUI'
  | 'CUAUH'
  | 'OTROS';

export type TipoClienteConsultoria = 'NUEVO' | 'RECURRENTE';

export type ProcesoPropuesta =
  | 'ESTRATEGIA'
  | 'INNOVACION'
  | 'PLATAFORMA'
  | 'DISENO_ORGANIZACIONAL'
  | 'HEAD_HUNTING'
  | 'ASSESSMENT'
  | 'TEAM_BUILDING'
  | 'COACHING'
  | 'ALINEACION'
  | 'OTRO';

export type StatusPropuesta = 'PROSPECTO' | 'NEGOCIACION' | 'GANADA' | 'PERDIDA';

export type RolProyecto = 'LIDER' | 'COMPARTIDO';
export type TipoProyecto = 'CONSULTORIA' | 'PLATAFORMA' | 'CONSULTORIA_Y_PLATAFORMA';
export type StatusProyecto = 'INICIANDO' | 'EN_PROCESO' | 'TERMINADO';

export interface ConsultorRef {
  _id: string;
  nombre: string;
}

export interface ClienteRef {
  _id: string;
  nombre: string;
  ubicacion?: UbicacionConsultoria;
  tipoCliente?: TipoClienteConsultoria;
}

export interface ConsultoriaCliente {
  _id: string;
  nombre: string;
  ubicacion: UbicacionConsultoria;
  tipoCliente: TipoClienteConsultoria;
  razonSocialFactura?: string;
  activo: boolean;
  notas?: string;
}

export interface ConsultoriaPropuesta {
  _id: string;
  anio: number;
  mes: number;
  numeroConsecutivo: number;
  ubicacion: UbicacionConsultoria;
  liderId: string | ConsultorRef;
  liderSecundarioId?: string | ConsultorRef | null;
  finderId?: string | ConsultorRef | null;
  clienteId: string | ClienteRef;
  tiempoEstimado?: string;
  proceso: ProcesoPropuesta;
  procesoDetalle?: string;
  monto: number | null;
  pctIva: number;
  status: StatusPropuesta;
  fechaRegistro?: string;
  notas?: string;
}

export interface ResumenPropuestas {
  total: number;
  montoTotal: number;
  conMonto: number;
  pctGanadas: number | null;
  pctNuevos: number | null;
  pctRecurrentes: number | null;
  porStatus: Record<StatusPropuesta, number>;
  porUbicacion: Record<string, number>;
  porProceso: Record<string, number>;
}

export interface ConsultoriaMeta {
  modulo: string;
  nombre: string;
  etapa: number;
  enums: {
    ubicaciones: UbicacionConsultoria[];
    tiposCliente: TipoClienteConsultoria[];
    procesos: ProcesoPropuesta[];
    statusPropuesta: StatusPropuesta[];
    rolesProyecto: RolProyecto[];
    tiposProyecto: TipoProyecto[];
    statusProyecto: StatusProyecto[];
  };
}

export const MESES_ES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const STATUS_LABEL: Record<StatusPropuesta, string> = {
  PROSPECTO: 'Prospecto',
  NEGOCIACION: 'Negociación',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
};

export function nombreRef(v: string | ConsultorRef | ClienteRef | null | undefined): string {
  if (!v) return '—';
  if (typeof v === 'object') return v.nombre || '—';
  return String(v);
}

export function idRef(v: string | { _id: string } | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'object') return v._id;
  return String(v);
}

export function moneyMx(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

export function pctLabel(ratio: number | null | undefined): string {
  if (ratio == null) return '—';
  return `${(Number(ratio) * 100).toFixed(1)}%`;
}

export function labelUbicacion(u: string): string {
  return u.replace(/_/g, ' ');
}

export function labelProceso(p: string): string {
  return p.replace(/_/g, ' ');
}
