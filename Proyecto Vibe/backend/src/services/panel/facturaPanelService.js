import { Factura, unidadEfectiva } from '../../models/Factura.js';
import { Egreso } from '../../models/Egreso.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear, finMesUtc } from './mesUtils.js';
import {
  normalizarVista,
  filtroFacturasPanel,
  calcularArrastres,
} from './vistaUtils.js';

function vacioUnidad() {
  return {
    facturado: 0,
    pagado: 0,
    pendiente: 0,
    numFacturas: 0,
    numPagadas: 0,
    numPendientes: 0,
    pctPagado: 0,
    arrastres: null,
  };
}

function vacioTechnologies() {
  return {
    ...vacioUnidad(),
    facturadoBBVA: 0,
    facturadoFueraBBVA: 0,
  };
}

function acumular(dest, monto, esPagado) {
  dest.facturado = redondear(dest.facturado + monto);
  dest.numFacturas += 1;
  if (esPagado) {
    dest.pagado = redondear(dest.pagado + monto);
    dest.numPagadas += 1;
  } else {
    dest.pendiente = redondear(dest.pendiente + monto);
    dest.numPendientes += 1;
  }
}

export async function calcularTotalesPorUnidad(mes, vista = 'cobro') {
  const v = normalizarVista(vista);
  const match = filtroFacturasPanel(mes, v);

  const facturas = await Factura.find(match)
    .select('unidad total estatusPago rfcEmisor cliente noFactura mes')
    .lean();

  const consulting = vacioUnidad();
  const technologies = vacioTechnologies();
  let sinClasificar = 0;

  for (const f of facturas) {
    const monto = Number(f.total) || 0;
    const esPagado = f.estatusPago === 'PAGADO';
    const u = unidadEfectiva(f.unidad);

    if (u === 'sin_clasificar') {
      sinClasificar += 1;
      continue;
    }

    if (u === 'Consulting') {
      acumular(consulting, monto, esPagado);
    } else if (u === 'Technologies') {
      acumular(technologies, monto, esPagado);
      if (f.rfcEmisor === 'OTRO') {
        technologies.facturadoFueraBBVA = redondear(technologies.facturadoFueraBBVA + monto);
      } else {
        technologies.facturadoBBVA = redondear(technologies.facturadoBBVA + monto);
      }
    }
  }

  for (const u of [consulting, technologies]) {
    u.pctPagado = u.facturado > 0 ? redondear(u.pagado / u.facturado) : 0;
  }

  if (v === 'cobro') {
    consulting.arrastres = calcularArrastres(facturas, mes, 'Consulting');
    technologies.arrastres = calcularArrastres(facturas, mes, 'Technologies');
  }

  return { consulting, technologies, sinClasificar, totalFacturas: facturas.length, vista: v };
}

/** Base para regla 10%: en cobro = total ingresado; en facturación = pagado (estatus). */
export function consultingBaseRegla10(totales, vista) {
  const v = normalizarVista(vista);
  if (v === 'cobro') return totales.consulting.facturado;
  return totales.consulting.pagado;
}

export async function calcularPagadoConsultingMes(mes, vista = 'cobro') {
  const { consulting } = await calcularTotalesPorUnidad(mes, vista);
  return normalizarVista(vista) === 'cobro' ? consulting.facturado : consulting.pagado;
}

export async function reservaAcumuladaTechnologies(hastaMes, vista = 'cobro') {
  const v = normalizarVista(vista);
  let ingresos = 0;

  if (v === 'cobro') {
    const facturas = await Factura.find({
      ...FILTRO_ACTIVAS,
      unidad: 'Technologies',
      estatusPago: 'PAGADO',
      estatusEnvio: { $ne: 'CANCELADA' },
      fechaPago: { $exists: true, $ne: null, $lte: finMesUtc(hastaMes) },
    })
      .select('total')
      .lean();
    ingresos = facturas.reduce((acc, f) => acc + (Number(f.total) || 0), 0);
  } else {
    const facturas = await Factura.find({
      ...FILTRO_ACTIVAS,
      mes: { $lte: hastaMes },
      unidad: 'Technologies',
      estatusEnvio: { $ne: 'CANCELADA' },
      estatusPago: { $ne: 'CANCELADO' },
    })
      .select('total estatusPago')
      .lean();
    for (const f of facturas) {
      if (f.estatusPago === 'PAGADO') ingresos += Number(f.total) || 0;
    }
  }

  const egresos = await Egreso.aggregate([
    { $match: { mes: { $lte: hastaMes }, unidad: 'Technologies' } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);

  return redondear(ingresos - (egresos[0]?.suma ?? 0));
}
