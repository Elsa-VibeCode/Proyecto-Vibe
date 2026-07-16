import { invalidarCachePanel, invalidarCachePanelPorMeses } from './panelCache.js';
import { mesAnterior } from './mesUtils.js';

export function invalidarPanelPorMes(mes, mesExtra) {
  const meses = new Set([mes, mesExtra, mes ? mesAnterior(mes) : null].filter(Boolean));
  invalidarCachePanelPorMeses([...meses]);
}

export function invalidarPanelCompleto() {
  invalidarCachePanel();
}
