import { ConsultoriaPropuesta } from '../models/ConsultoriaPropuesta.js';
import { ConsultoriaProyecto } from '../models/ConsultoriaProyecto.js';
import { ConsultoriaIngresoMensual } from '../models/ConsultoriaIngresoMensual.js';
import { Egreso } from '../models/Egreso.js';
import { Consultant } from '../models/Consultant.js';
import {
  listarIngresosMensuales,
  comparativoAnual,
  resumenEgresosConsultoria,
} from './consultoriaIngresosService.js';
import { resumenPropuestas, resumenProyectos } from './consultoriaService.js';
import {
  toCents,
  fromCents,
  cumplimiento,
  acumuladosHastaMes,
} from '../utils/consultoriaMotor.js';
import { STATUS_PROPUESTA, STATUS_PROYECTO } from '../utils/consultoriaConstants.js';

function periodoKey(anio, mes) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

/**
 * Dashboard Consultoría (BWConsulting).
 * Filtros: anio, mes (opcional, default mes actual), consultorId, ubicacion.
 */
export async function dashboardConsultoria(query = {}) {
  const ahora = new Date();
  const anio = Number(query.anio) || ahora.getFullYear();
  const mes = query.mes ? Number(query.mes) : ahora.getMonth() + 1;
  const consultorId = query.consultorId || '';
  const ubicacion = query.ubicacion || '';

  const filtroProp = { anio };
  if (ubicacion) filtroProp.ubicacion = ubicacion;
  if (consultorId) filtroProp.liderId = consultorId;

  const filtroProy = { activos: 'true' };
  if (consultorId) filtroProy.consultorId = consultorId;

  const [
    ingresosAnio,
    comparativo,
    resProp,
    resProy,
    egresosMes,
    propuestasAnio,
    proyectosActivos,
    consultores,
  ] = await Promise.all([
    listarIngresosMensuales({ anio }),
    comparativoAnual(anio),
    resumenPropuestas(filtroProp),
    resumenProyectos(filtroProy),
    resumenEgresosConsultoria(anio, mes),
    ConsultoriaPropuesta.find(filtroProp).select('status liderId monto').lean(),
    ConsultoriaProyecto.find({
      activo: true,
      ...(consultorId
        ? {
            $or: [{ consultorId }, { consultorCompartidoId: consultorId }],
          }
        : {}),
    })
      .populate('consultorId', 'nombre')
      .select('status consultorId')
      .lean(),
    Consultant.find({ activo: true }).select('nombre').sort({ nombre: 1 }).lean(),
  ]);

  const mesActual = ingresosAnio.find((i) => i.mes === mes && !i.esHistoricoAnual) || {
    anio,
    mes,
    facturacion: 0,
    ingresoReal: 0,
    meta: 0,
    cerrado: false,
    cumplimientoMes: null,
    ingresoAcumulado: 0,
    metaAcumulada: 0,
    cumplimientoAcumulado: null,
    conciliacion: { cuadra: true, diferencia: 0, sumaDetalle: 0, ingresoReal: 0 },
  };

  // Si no hay registro del mes, calcular acum solo con lo que hay
  const filasYtd = ingresosAnio.filter((i) => !i.esHistoricoAnual && i.mes <= mes);
  const acum = acumuladosHastaMes(
    filasYtd.map((f) => ({ mes: f.mes, ingresoReal: f.ingresoReal, meta: f.meta })),
    mes
  );

  const chartIngresoVsMeta = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const fila = ingresosAnio.find((x) => x.mes === m && !x.esHistoricoAnual);
    return {
      mes: m,
      label: periodoKey(anio, m),
      ingresoReal: fila?.ingresoReal ?? 0,
      meta: fila?.meta ?? 0,
      facturacion: fila?.facturacion ?? 0,
      cerrado: Boolean(fila?.cerrado),
    };
  });

  // Egresos por mes del año (unidad Consulting)
  const egresosAnio = await Egreso.find({
    mes: { $regex: `^${anio}-` },
    unidad: 'Consulting',
  })
    .select('mes total subtotal')
    .lean();

  const egresosPorMes = Array(12).fill(0);
  for (const e of egresosAnio) {
    const mm = Number(String(e.mes).slice(5, 7));
    if (mm >= 1 && mm <= 12) {
      egresosPorMes[mm - 1] = fromCents(toCents(egresosPorMes[mm - 1]) + toCents(e.total));
    }
  }

  const chartEgresos = egresosPorMes.map((total, i) => ({
    mes: i + 1,
    label: periodoKey(anio, i + 1),
    egresos: total,
  }));

  // Distribución proyectos por consultor (donut)
  const porConsultorMap = new Map();
  for (const p of proyectosActivos) {
    const id = String(p.consultorId?._id || p.consultorId);
    const nombre = p.consultorId?.nombre || id;
    if (!porConsultorMap.has(id)) {
      porConsultorMap.set(id, { consultorId: id, nombre, total: 0 });
    }
    porConsultorMap.get(id).total += 1;
  }
  const totalProy = proyectosActivos.length || 1;
  const distribucionConsultores = [...porConsultorMap.values()]
    .map((c) => ({
      ...c,
      pct: Math.round((c.total / totalProy) * 10000) / 10000,
    }))
    .sort((a, b) => b.total - a.total);

  // Propuestas ganadas por líder (año)
  const ganadasPorLider = new Map();
  let totalGanadas = 0;
  for (const p of propuestasAnio) {
    if (p.status !== 'GANADA') continue;
    totalGanadas += 1;
    const id = String(p.liderId);
    ganadasPorLider.set(id, (ganadasPorLider.get(id) || 0) + 1);
  }
  const nombreConsultor = new Map(consultores.map((c) => [String(c._id), c.nombre]));
  const chartGanadasPorConsultor = [...ganadasPorLider.entries()]
    .map(([id, total]) => ({
      consultorId: id,
      nombre: nombreConsultor.get(id) || id,
      total,
      pct: totalGanadas ? Math.round((total / totalGanadas) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const pipelinePorStatus = Object.fromEntries(STATUS_PROPUESTA.map((s) => [s, 0]));
  for (const p of propuestasAnio) {
    pipelinePorStatus[p.status] = (pipelinePorStatus[p.status] || 0) + 1;
  }

  return {
    filtros: { anio, mes, consultorId: consultorId || null, ubicacion: ubicacion || null },
    kpis: {
      ingresoMes: mesActual.ingresoReal ?? 0,
      metaMes: mesActual.meta ?? 0,
      cumplimientoMes:
        mesActual.cumplimientoMes ?? cumplimiento(mesActual.ingresoReal, mesActual.meta),
      ingresoAcumulado: acum.ingresoAcumulado,
      metaAcumulada: acum.metaAcumulada,
      cumplimientoAcumulado: acum.cumplimientoAcumulado,
      egresosMes: egresosMes.total,
      egresosCantidad: egresosMes.cantidad,
      proyectosActivos: resProy.total,
      proyectosPorStatus: resProy.porStatus,
      propuestasPipeline: resProp.total,
      propuestasPorStatus: resProp.porStatus,
      pctGanadas: resProp.pctGanadas,
      mesCerrado: Boolean(mesActual.cerrado),
      conciliacionOk: mesActual.conciliacion?.cuadra !== false,
    },
    charts: {
      ingresoVsMeta: chartIngresoVsMeta,
      egresosPorMes: chartEgresos,
      comparativoAnual: comparativo,
      distribucionProyectos: distribucionConsultores,
      ganadasPorConsultor: chartGanadasPorConsultor,
      pipelinePorStatus,
      proyectosPorStatus: resProy.porStatus || Object.fromEntries(STATUS_PROYECTO.map((s) => [s, 0])),
    },
    formulas: {
      cumplimientoMes: 'ingreso_real / meta',
      cumplimientoAcumulado: 'SUM(ingreso_real YTD) / SUM(meta YTD)',
      egresosMes: 'SUM(Egreso.total) unidad=Consulting mes',
      ganadasPct: 'ganadas / total propuestas del filtro',
    },
    enlaces: {
      propuestas: '/consultoria/propuestas',
      proyectos: '/consultoria/proyectos',
      ingresos: '/consultoria/ingresos',
      egresos: '/egresos',
    },
    consultores,
  };
}
