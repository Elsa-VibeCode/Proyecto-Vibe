import { Factura } from '../../models/Factura.js';
import { Egreso } from '../../models/Egreso.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear, mesesAnteriores } from './mesUtils.js';

async function ingresosMes(mes) {
  const facturas = await Factura.find({
    ...FILTRO_ACTIVAS,
    mes,
    estatusEnvio: { $ne: 'CANCELADA' },
    estatusPago: { $ne: 'CANCELADO' },
    unidad: { $in: ['Consulting', 'Strategy', 'Technologies'] },
  })
    .select('unidad total rfcEmisor')
    .lean();

  let consultingIngreso = 0;
  let techBBVA = 0;
  let techFuera = 0;

  for (const f of facturas) {
    const monto = Number(f.total) || 0;
    const u = f.unidad === 'Strategy' ? 'Consulting' : f.unidad;
    if (u === 'Consulting') consultingIngreso += monto;
    else if (u === 'Technologies') {
      if (f.rfcEmisor === 'OTRO') techFuera += monto;
      else techBBVA += monto;
    }
  }

  return {
    consultingIngreso: redondear(consultingIngreso),
    techBBVA: redondear(techBBVA),
    techFuera: redondear(techFuera),
  };
}

async function egresosMes(mes) {
  const rows = await Egreso.aggregate([
    { $match: { mes } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  return redondear(rows[0]?.suma ?? 0);
}

export async function datosMeses(mesFinal, cantidad) {
  const meses = mesesAnteriores(mesFinal, cantidad);
  const series = [];

  for (const mes of meses) {
    const ingresos = await ingresosMes(mes);
    const egresosTotal = await egresosMes(mes);
    series.push({
      mes,
      consultingIngreso: ingresos.consultingIngreso,
      techBBVA: ingresos.techBBVA,
      techFuera: ingresos.techFuera,
      egresosTotal,
    });
  }

  return series;
}

export async function datos6Meses(mesFinal) {
  return datosMeses(mesFinal, 6);
}

export async function datos12Meses(mesFinal) {
  return datosMeses(mesFinal, 12);
}
