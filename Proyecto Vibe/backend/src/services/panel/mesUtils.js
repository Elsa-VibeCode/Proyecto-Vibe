export const redondear = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function mesActualSistema() {
  const mx = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const y = mx.getFullYear();
  const m = String(mx.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function esMesValido(mes) {
  return /^\d{4}-\d{2}$/.test(String(mes ?? ''));
}

export function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function mesesAnteriores(mesFinal, cantidad) {
  const meses = [];
  let actual = mesFinal;
  for (let i = 0; i < cantidad; i += 1) {
    meses.unshift(actual);
    actual = mesAnterior(actual);
  }
  return meses;
}

export function reglaAplicaEnMes(mes, fechaVigenciaRegla) {
  if (!mes || !fechaVigenciaRegla) return false;
  const vigenciaMes = String(fechaVigenciaRegla).slice(0, 7);
  return mes >= vigenciaMes;
}

export function inicioMesUtc(mes) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function finMesUtc(mes) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}
