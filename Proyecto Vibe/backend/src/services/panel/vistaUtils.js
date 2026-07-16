import { FILTRO_ACTIVAS } from '../facturaService.js';
import { inicioMesUtc, finMesUtc, redondear } from './mesUtils.js';

export const VISTAS_PANEL = ['cobro', 'facturacion'];

export function normalizarVista(vista) {
  return vista === 'facturacion' ? 'facturacion' : 'cobro';
}

export function rangoMesUtc(mes) {
  return { $gte: inicioMesUtc(mes), $lte: finMesUtc(mes) };
}

/** Filtro MongoDB para facturas del Panel según vista contable. */
export function filtroFacturasPanel(mes, vista) {
  const base = {
    ...FILTRO_ACTIVAS,
    estatusEnvio: { $ne: 'CANCELADA' },
    estatusPago: { $ne: 'CANCELADO' },
  };

  if (normalizarVista(vista) === 'cobro') {
    const rango = rangoMesUtc(mes);
    return {
      ...base,
      fechaPago: { $exists: true, $ne: null, $gte: rango.$gte, $lte: rango.$lte },
    };
  }

  return { ...base, mes };
}

/** Facturas cobradas en `mes` pero emitidas en otro mes (arrastre). */
export function calcularArrastres(facturas, mesActivo, unidadObjetivo) {
  const arr = facturas.filter((f) => {
    if (!f.mes || f.mes === mesActivo) return false;
    const u = f.unidad === 'Strategy' ? 'Consulting' : f.unidad;
    if (unidadObjetivo === 'Consulting') return u === 'Consulting';
    if (unidadObjetivo === 'Technologies') return u === 'Technologies';
    return false;
  });

  if (!arr.length) return null;

  const porMes = new Map();
  for (const f of arr) {
    const m = f.mes;
    if (!porMes.has(m)) porMes.set(m, []);
    porMes.get(m).push(f);
  }

  const grupos = [...porMes.entries()]
    .map(([mesOrigen, items]) => ({
      mesOrigen,
      count: items.length,
      monto: redondear(items.reduce((acc, f) => acc + (Number(f.total) || 0), 0)),
      folios: items.map((f) => ({
        folio: f.noFactura,
        cliente: f.cliente,
        total: Number(f.total) || 0,
        mesOrigen: f.mes,
      })),
    }))
    .sort((a, b) => b.monto - a.monto);

  const principal = grupos[0];
  const totalMonto = redondear(arr.reduce((acc, f) => acc + (Number(f.total) || 0), 0));

  return {
    count: arr.length,
    monto: totalMonto,
    mesOrigen: principal.mesOrigen,
    grupos,
    folios: arr.map((f) => ({
      folio: f.noFactura,
      cliente: f.cliente,
      total: Number(f.total) || 0,
      mesOrigen: f.mes,
    })),
  };
}
