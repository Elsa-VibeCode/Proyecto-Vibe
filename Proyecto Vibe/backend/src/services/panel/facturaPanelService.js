import { Factura, unidadEfectiva } from '../../models/Factura.js';
import { Egreso } from '../../models/Egreso.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear } from './mesUtils.js';

function vacioUnidad() {
  return {
    facturado: 0,
    pagado: 0,
    pendiente: 0,
    numFacturas: 0,
    numPagadas: 0,
    numPendientes: 0,
    pctPagado: 0,
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

export async function calcularTotalesPorUnidad(mes) {
  const match = {
    ...FILTRO_ACTIVAS,
    mes,
    estatusEnvio: { $ne: 'CANCELADA' },
    estatusPago: { $ne: 'CANCELADO' },
  };

  const facturas = await Factura.find(match)
    .select('unidad total estatusPago rfcEmisor cliente')
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

  return { consulting, technologies, sinClasificar, totalFacturas: facturas.length };
}

export async function calcularPagadoConsultingMes(mes) {
  const { consulting } = await calcularTotalesPorUnidad(mes);
  return consulting.pagado;
}

export async function reservaAcumuladaTechnologies(hastaMes) {
  const match = {
    ...FILTRO_ACTIVAS,
    mes: { $lte: hastaMes },
    estatusEnvio: { $ne: 'CANCELADA' },
    estatusPago: { $ne: 'CANCELADO' },
    unidad: { $in: ['Technologies'] },
  };

  const facturas = await Factura.find(match).select('total estatusPago').lean();
  let ingresos = 0;
  for (const f of facturas) {
    if (f.estatusPago === 'PAGADO') ingresos += Number(f.total) || 0;
  }

  const egresos = await Egreso.aggregate([
    { $match: { mes: { $lte: hastaMes }, unidad: 'Technologies' } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);

  const egresosTotal = egresos[0]?.suma ?? 0;
  return redondear(ingresos - egresosTotal);
}
