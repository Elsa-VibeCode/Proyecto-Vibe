const TTL_MS = 60_000;
const cache = new Map();

function clavePanel(mes) {
  return `panel:${mes}`;
}

export function obtenerCachePanel(mes) {
  const entry = cache.get(clavePanel(mes));
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(clavePanel(mes));
    return null;
  }
  return { ...entry.data, desdeCache: true };
}

export function guardarCachePanel(mes, data) {
  cache.set(clavePanel(mes), { ts: Date.now(), data: { ...data, desdeCache: false } });
}

export function invalidarCachePanel(mes) {
  if (mes) {
    cache.delete(clavePanel(mes));
    return;
  }
  cache.clear();
}

export function invalidarCachePanelPorMeses(meses = []) {
  for (const mes of meses) {
    if (mes) invalidarCachePanel(mes);
  }
}
