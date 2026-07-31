/**
 * Motor de cálculo Consultoría (BWConsulting).
 * Montos en centavos enteros; redondeo HALF_UP solo al convertir a pesos.
 * Misma precisión que honorariosMotor.
 */

export function toCents(pesos) {
  const n = Number(pesos);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

export function redondearPesos(v) {
  return fromCents(toCents(v));
}

/** Ratio 0–1 con 4 decimales (p. ej. cumplimiento 0.6250). */
export function redondearRatio(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

/** cumplimiento = real / meta; null si meta = 0. */
export function cumplimiento(real, meta) {
  const m = Number(meta) || 0;
  if (m === 0) return null;
  return redondearRatio((Number(real) || 0) / m);
}

/**
 * Acumulados YTD hasta mesInclusive (1-12).
 * @param {Array<{mes:number, ingresoReal:number, meta:number}>} filasDelAnio
 */
export function acumuladosHastaMes(filasDelAnio, mesInclusive) {
  const hasta = Number(mesInclusive) || 12;
  let ingresoAcum = 0;
  let metaAcum = 0;
  for (const f of filasDelAnio || []) {
    if (Number(f.mes) > hasta) continue;
    ingresoAcum += toCents(f.ingresoReal);
    metaAcum += toCents(f.meta);
  }
  return {
    ingresoAcumulado: fromCents(ingresoAcum),
    metaAcumulada: fromCents(metaAcum),
    cumplimientoAcumulado: cumplimiento(fromCents(ingresoAcum), fromCents(metaAcum)),
  };
}

/** gap = ingresosFijos - nómina */
export function gapNomina(ingresosFijos, montoNomina) {
  return redondearPesos((Number(ingresosFijos) || 0) - (Number(montoNomina) || 0));
}

/**
 * % ejercido s/ presupuesto. null si presupuesto = 0.
 */
export function pctEjercido(egresos, presupuesto) {
  const p = Number(presupuesto) || 0;
  if (p === 0) return null;
  return redondearRatio((Number(egresos) || 0) / p);
}

/**
 * Suma montoCobrado del detalle y compara vs ingresoReal declarado.
 * @returns {{ sumaDetalle: number, ingresoReal: number, cuadra: boolean, diferencia: number }}
 */
export function conciliarIngresoMes(ingresoReal, montosCobrados) {
  const sumaCents = (montosCobrados || []).reduce((acc, m) => acc + toCents(m), 0);
  const realCents = toCents(ingresoReal);
  const diff = realCents - sumaCents;
  return {
    sumaDetalle: fromCents(sumaCents),
    ingresoReal: fromCents(realCents),
    cuadra: diff === 0,
    diferencia: fromCents(diff),
  };
}

/**
 * Valida % compartido: principal + compartido = 1 (tolerancia 0.0001).
 */
export function validarPctCompartido(pctPrincipal, pctCompartido, rol) {
  if (rol !== 'COMPARTIDO') {
    return { ok: true, pctPrincipal: 1, pctCompartido: 0 };
  }
  const a = Number(pctPrincipal);
  const b = Number(pctCompartido);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: 'Porcentajes de compartido inválidos' };
  }
  if (Math.abs(a + b - 1) > 0.0001) {
    return {
      ok: false,
      error: `pctConsultorPrincipal + pctConsultorCompartido debe ser 100% (ahora ${((a + b) * 100).toFixed(2)}%)`,
    };
  }
  return { ok: true, pctPrincipal: a, pctCompartido: b };
}

/** Reparte un monto cobrado según % del proyecto. */
export function repartirMontoCompartido(monto, pctPrincipal, pctCompartido) {
  const total = toCents(monto);
  const partePrincipal = Math.round(total * (Number(pctPrincipal) || 0));
  const parteCompartido = total - partePrincipal;
  // Si pctCompartido explícito, preferir redondeo sobre ese pct y ajustar residual al principal
  if (pctCompartido !== undefined && pctCompartido !== null) {
    const c = Math.round(total * (Number(pctCompartido) || 0));
    return {
      principal: fromCents(total - c),
      compartido: fromCents(c),
    };
  }
  return {
    principal: fromCents(partePrincipal),
    compartido: fromCents(parteCompartido),
  };
}
