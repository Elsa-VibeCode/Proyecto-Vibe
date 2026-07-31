/**
 * Constantes del módulo Consultoría (BWConsulting).
 * Montos: sin IVA (mismo criterio que Honorarios). IVA solo informativo.
 */

export const UBICACIONES_CONSULTORIA = [
  'BAJA_CALIFORNIA',
  'CUU',
  'JRZ',
  'MEOQUI',
  'CUAUH',
  'OTROS',
];

export const TIPOS_CLIENTE = ['NUEVO', 'RECURRENTE'];

export const PROCESOS_PROPUESTA = [
  'ESTRATEGIA',
  'INNOVACION',
  'PLATAFORMA',
  'DISENO_ORGANIZACIONAL',
  'HEAD_HUNTING',
  'ASSESSMENT',
  'TEAM_BUILDING',
  'COACHING',
  'ALINEACION',
  'OTRO',
];

export const STATUS_PROPUESTA = ['PROSPECTO', 'NEGOCIACION', 'GANADA', 'PERDIDA'];

export const ROLES_PROYECTO = ['LIDER', 'COMPARTIDO'];

export const TIPOS_PROYECTO = ['CONSULTORIA', 'PLATAFORMA', 'CONSULTORIA_Y_PLATAFORMA'];

export const STATUS_PROYECTO = ['INICIANDO', 'EN_PROCESO', 'TERMINADO'];

/** IVA default MX; 0 = exento (mismo patrón Honorarios). */
export const DEFAULT_PCT_IVA_CONSULTORIA = 0.16;
