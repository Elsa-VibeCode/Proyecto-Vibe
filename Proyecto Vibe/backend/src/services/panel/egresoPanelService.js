import { Egreso } from '../../models/Egreso.js';
import { redondear } from './mesUtils.js';

export async function calcularTotalesPorUnidad(mes) {
  const filas = await Egreso.aggregate([
    { $match: { mes } },
    { $group: { _id: '$unidad', suma: { $sum: '$total' }, count: { $sum: 1 } } },
  ]);

  const porUnidad = Object.fromEntries(filas.map((f) => [f._id, { total: redondear(f.suma), count: f.count }]));

  const grupo = porUnidad.Grupo?.total ?? 0;
  const consulting = porUnidad.Consulting?.total ?? 0;
  const technologies = porUnidad.Technologies?.total ?? 0;
  const todos = porUnidad.Todos?.total ?? 0;

  return {
    grupo,
    consulting,
    technologies,
    todos,
    egresosTotal: redondear(filas.reduce((acc, f) => acc + (f.suma || 0), 0)),
    count: filas.reduce((acc, f) => acc + (f.count || 0), 0),
  };
}

export async function egresosGrupoMes(mes) {
  const { grupo } = await calcularTotalesPorUnidad(mes);
  return grupo;
}

export async function coberturaGrupo(mes, recibio10pct) {
  const egresosTotal = await egresosGrupoMes(mes);
  if (egresosTotal <= 0) {
    return { consulting: 0, technologies: 0, egresosTotal: 0 };
  }

  const aporte = Math.min(recibio10pct, egresosTotal);
  const consulting = redondear(aporte / egresosTotal);
  const technologies = redondear(1 - consulting);

  return { consulting, technologies, egresosTotal };
}

export async function existeTipoGasto(mes, patron) {
  const rx = new RegExp(patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const count = await Egreso.countDocuments({ mes, tipoGasto: rx });
  return count > 0;
}

export async function existeTransferLatam(mes) {
  const count = await Egreso.countDocuments({ mes, esTransferLatam: true });
  return count > 0;
}
