/**
 * Motor de distribución de honorarios Consulting.
 * Cálculos en centavos enteros (sin float intermedio).
 * Redondeo a 2 decimales solo al convertir a pesos (HALF_UP via Math.round).
 */

export const ROLES_HONORARIO = ['FINDER', 'CLOSER', 'EJECUCION'];

export const DEFAULTS_JUNIO_2026 = {
  pctTech: 0.05,
  pctLicencia: 0.2,
  pctGrupo: 0.1,
  pctFinder: 0.1,
  pctCloser: 0.15,
  pctEjecucion: 0.65,
};

/** Abril/Mayo 2026: un solo concepto TECH/DONATIVO 10%. */
export const DEFAULTS_PRE_JUNIO_2026 = {
  pctTech: 0.1,
  pctLicencia: 0,
  pctGrupo: 0.1,
  pctFinder: 0.1,
  pctCloser: 0.15,
  pctEjecucion: 0.65,
};

export function defaultsPorPeriodo(periodo) {
  if (!periodo || periodo < '2026-06') return { ...DEFAULTS_PRE_JUNIO_2026 };
  return { ...DEFAULTS_JUNIO_2026 };
}

export function toCents(pesos) {
  const n = Number(pesos);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

/** pct decimal (0.05) → basis points × 100 (5000 = 5.00%). */
function pctToBp100(pct) {
  return Math.round(Number(pct) * 10000);
}

/** cents × pct con HALF_UP en centavos. */
export function centsTimesPct(cents, pct) {
  const bp = pctToBp100(pct);
  return Math.round((Number(cents) * bp) / 10000);
}

/**
 * Calcula una distribución mensual.
 * @param {object} input
 * @param {number} input.ingreso1aQna
 * @param {number} input.ingreso2daQna
 * @param {number} input.pctTech
 * @param {number} input.pctLicencia
 * @param {number} input.pctGrupo
 * @param {Array<{rol:string,pct:number,consultantId?:string}>} input.asignaciones
 */
export function calcularDistribucion(input) {
  const ingreso1a = toCents(input.ingreso1aQna);
  const ingreso2da = toCents(input.ingreso2daQna);
  const ingresoTotal = ingreso1a + ingreso2da;

  const pctTech = Number(input.pctTech) || 0;
  const pctLicencia = Number(input.pctLicencia) || 0;
  const pctGrupo = Number(input.pctGrupo) || 0;

  const montoTech = centsTimesPct(ingresoTotal, pctTech);
  const montoLicencia = centsTimesPct(ingresoTotal, pctLicencia);
  const montoGrupo = centsTimesPct(ingresoTotal, pctGrupo);
  const netoDistribuible = ingresoTotal - montoTech - montoLicencia;

  const asignaciones = (input.asignaciones || []).map((a) => {
    const pct = Number(a.pct) || 0;
    const monto = centsTimesPct(netoDistribuible, pct);
    return {
      consultantId: a.consultantId ?? null,
      rol: a.rol,
      pct,
      montoCents: monto,
      monto: fromCents(monto),
    };
  });

  const sumaRolesPct = asignaciones.reduce((acc, a) => acc + (Number(a.pct) || 0), 0);
  const sumaRolesMonto = asignaciones.reduce((acc, a) => acc + a.montoCents, 0);
  const advertenciaPct =
    Math.abs(sumaRolesPct - 0.9) > 0.0001
      ? `FINDER+CLOSER+EJECUCIÓN = ${(sumaRolesPct * 100).toFixed(2)}% (esperado ~90%)`
      : null;

  const totalPagado =
    montoTech + montoLicencia + montoGrupo + sumaRolesMonto;
  const diferenciaIngreso = ingresoTotal - totalPagado;

  return {
    ingreso1aQna: fromCents(ingreso1a),
    ingreso2daQna: fromCents(ingreso2da),
    ingresoTotal: fromCents(ingresoTotal),
    pctTech,
    pctLicencia,
    pctGrupo,
    montoTech: fromCents(montoTech),
    montoLicencia: fromCents(montoLicencia),
    montoGrupo: fromCents(montoGrupo),
    netoDistribuible: fromCents(netoDistribuible),
    asignaciones,
    sumaRolesPct,
    advertenciaPct,
    totalPagado: fromCents(totalPagado),
    diferenciaIngreso: fromCents(diferenciaIngreso),
    // centavos (auditoría / tests)
    _cents: {
      ingresoTotal,
      montoTech,
      montoLicencia,
      montoGrupo,
      netoDistribuible,
      sumaRolesMonto,
      totalPagado,
    },
  };
}

/** Prorratea un monto mensual a quincenas según peso de ingresos. */
export function prorratearQuincenas(montoPesos, ingreso1a, ingreso2da) {
  const total = toCents(ingreso1a) + toCents(ingreso2da);
  const monto = toCents(montoPesos);
  if (total <= 0) return { q1: 0, q2: 0 };
  const q1 = Math.round((monto * toCents(ingreso1a)) / total);
  const q2 = monto - q1;
  return { q1: fromCents(q1), q2: fromCents(q2) };
}
