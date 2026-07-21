export type RolHonorario = 'FINDER' | 'CLOSER' | 'EJECUCION';

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export interface Consultant {
  _id: string;
  nombre: string;
  activo: boolean;
}

export interface HonorarioProject {
  _id: string;
  nombre: string;
  cliente?: string;
  activo: boolean;
}

export interface PercentagePreset {
  _id: string;
  nombre: string;
  pctTech: number;
  pctLicencia: number;
  pctGrupo: number;
  pctFinder: number;
  pctCloser: number;
  pctEjecucion: number;
}

export interface RoleAssignment {
  _id?: string;
  consultantId: string | Consultant;
  rol: RolHonorario;
  pct: number;
}

export interface CalculoAsignacion {
  consultantId: string | null;
  rol: RolHonorario;
  pct: number;
  monto: number;
}

export interface CalculoDistribucion {
  ingreso1aQna: number;
  ingreso2daQna: number;
  ingresoTotal: number;
  pctTech: number;
  pctLicencia: number;
  pctGrupo: number;
  montoTech: number;
  montoLicencia: number;
  montoGrupo: number;
  netoDistribuible: number;
  asignaciones: CalculoAsignacion[];
  sumaRolesPct: number;
  advertenciaPct: string | null;
  totalPagado: number;
  diferenciaIngreso: number;
}

export interface MonthlyDistribution {
  _id: string | null;
  projectId: string | HonorarioProject;
  periodo: string;
  ingreso1aQna: number;
  ingreso2daQna: number;
  pctTech: number;
  pctLicencia: number;
  pctGrupo: number;
  grupoConsultantId?: string | Consultant | null;
  asignaciones: RoleAssignment[];
  observaciones?: string;
  calculo?: CalculoDistribucion;
  esBorrador?: boolean;
}

export interface MontosConsultor {
  FINDER: number;
  CLOSER: number;
  EJECUCION: number;
  GRUPO: number;
  total: number;
  q1: number;
  q2: number;
}

export interface ReporteMensual {
  periodo: string;
  consultores: { _id: string; nombre: string }[];
  filas: {
    projectId: string;
    proyecto: string;
    ingreso1aQna: number;
    ingreso2daQna: number;
    ingresoTotal: number;
    montoTech: number;
    montoLicencia: number;
    montoGrupo: number;
    netoDistribuible: number;
    advertenciaPct: string | null;
    porConsultor: Record<string, MontosConsultor>;
    diferenciaIngreso: number;
  }[];
  totales: {
    ingreso1aQna: number;
    ingreso2daQna: number;
    ingresoTotal: number;
    montoTech: number;
    montoLicencia: number;
    montoGrupo: number;
    netoDistribuible: number;
    porConsultor: Record<string, MontosConsultor>;
  };
}

export interface ReporteConsultor {
  consultor: { _id: string; nombre: string };
  desde: string | null;
  hasta: string | null;
  desglose: {
    periodo: string;
    proyecto: string;
    rol: string;
    pct: number;
    monto: number;
    q1: number;
    q2: number;
  }[];
  total: number;
}

export interface ReporteIngresos {
  meses: {
    periodo: string;
    ingresoTotal: number;
    montoTech: number;
    montoLicencia: number;
    montoGrupo: number;
    netoDistribuible: number;
  }[];
  porProyecto: {
    periodo: string;
    proyecto: string;
    ingresoTotal: number;
    montoTech: number;
    montoLicencia: number;
  }[];
  granTotal: {
    ingresoTotal: number;
    montoTech: number;
    montoLicencia: number;
    montoGrupo: number;
    netoDistribuible: number;
  };
}

export function pctLabel(pct: number): string {
  return `${(Number(pct) * 100).toFixed(2)}%`;
}

export function money(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}
