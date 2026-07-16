import { normalizarVista, VISTAS_PANEL } from './vistaUtils.js';

const TTL_MS = 60_000;
const cache = new Map();

function clavePanel(mes, vista) {
  return `panel:${mes}:${normalizarVista(vista)}`;
}

export function obtenerCachePanel(mes, vista = 'cobro') {
  const entry = cache.get(clavePanel(mes, vista));
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(clavePanel(mes, vista));
    return null;
  }
  return { ...entry.data, desdeCache: true };
}

export function guardarCachePanel(mes, vista, data) {
  cache.set(clavePanel(mes, vista), {
    ts: Date.now(),
    data: { ...data, desdeCache: false },
  });
}

export function invalidarCachePanel(mes) {
  if (mes) {
    for (const vista of VISTAS_PANEL) {
      cache.delete(clavePanel(mes, vista));
    }
    return;
  }
  cache.clear();
}

export function invalidarCachePanelPorMeses(meses = []) {
  for (const mes of meses) {
    if (mes) invalidarCachePanel(mes);
  }
}
