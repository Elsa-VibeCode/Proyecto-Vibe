import { Consultant } from '../models/Consultant.js';
import { HonorarioProject } from '../models/HonorarioProject.js';
import { MonthlyDistribution } from '../models/MonthlyDistribution.js';
import { PercentagePreset } from '../models/PercentagePreset.js';
import {
  calcularDistribucion,
  defaultsPorPeriodo,
  prorratearQuincenas,
  ROLES_HONORARIO,
} from '../utils/honorariosMotor.js';
import { generarExcel } from '../utils/excel.js';

function enriquecerConCalculo(doc) {
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  const calc = calcularDistribucion({
    ingreso1aQna: plain.ingreso1aQna,
    ingreso2daQna: plain.ingreso2daQna,
    pctTech: plain.pctTech,
    pctLicencia: plain.pctLicencia,
    pctGrupo: plain.pctGrupo,
    pctIva: plain.pctIva,
    asignaciones: (plain.asignaciones || []).map((a) => ({
      consultantId: a.consultantId,
      rol: a.rol,
      pct: a.pct,
    })),
  });
  return { ...plain, calculo: calc };
}

function validarPeriodo(periodo) {
  if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) {
    throw new Error('periodo debe ser YYYY-MM');
  }
}

function normalizarAsignaciones(asignaciones = []) {
  return asignaciones.map((a) => {
    if (!a.consultantId) throw new Error('Cada asignación requiere consultantId');
    if (!ROLES_HONORARIO.includes(a.rol)) {
      throw new Error(`Rol inválido: ${a.rol}`);
    }
    const pct = Number(a.pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
      throw new Error(`Porcentaje inválido para ${a.rol}`);
    }
    return {
      consultantId: a.consultantId,
      rol: a.rol,
      pct,
    };
  });
}

// ---- Consultants ----
export async function listarConsultores({ activos } = {}) {
  const filtro = {};
  if (activos === 'true' || activos === true) filtro.activo = true;
  return Consultant.find(filtro).sort({ nombre: 1 }).lean();
}

export async function crearConsultor(datos) {
  return Consultant.create({
    nombre: String(datos.nombre || '').trim(),
    activo: datos.activo !== false,
  });
}

export async function actualizarConsultor(id, datos) {
  const doc = await Consultant.findById(id);
  if (!doc) return null;
  if (datos.nombre !== undefined) doc.nombre = String(datos.nombre).trim();
  if (datos.activo !== undefined) doc.activo = Boolean(datos.activo);
  await doc.save();
  return doc;
}

// ---- Projects ----
export async function listarProyectos({ activos } = {}) {
  const filtro = {};
  if (activos === 'true' || activos === true) filtro.activo = true;
  return HonorarioProject.find(filtro).sort({ nombre: 1 }).lean();
}

export async function crearProyecto(datos) {
  return HonorarioProject.create({
    nombre: String(datos.nombre || '').trim(),
    cliente: String(datos.cliente || '').trim(),
    activo: datos.activo !== false,
  });
}

export async function actualizarProyecto(id, datos) {
  const doc = await HonorarioProject.findById(id);
  if (!doc) return null;
  if (datos.nombre !== undefined) doc.nombre = String(datos.nombre).trim();
  if (datos.cliente !== undefined) doc.cliente = String(datos.cliente).trim();
  if (datos.activo !== undefined) doc.activo = Boolean(datos.activo);
  await doc.save();
  return doc;
}

// ---- Presets ----
export async function listarPresets() {
  return PercentagePreset.find().sort({ nombre: 1 }).lean();
}

export async function crearPreset(datos) {
  return PercentagePreset.create(datos);
}

// ---- Monthly distributions ----
export async function obtenerOCrearBorrador(projectId, periodo) {
  validarPeriodo(periodo);
  let doc = await MonthlyDistribution.findOne({ projectId, periodo });
  if (doc) return enriquecerConCalculo(doc);

  const proyecto = await HonorarioProject.findById(projectId).lean();
  const defs = defaultsPorPeriodo(periodo);
  const pctIva = proyecto?.pctIva ?? 0.16;
  return {
    _id: null,
    projectId,
    periodo,
    ingreso1aQna: 0,
    ingreso2daQna: 0,
    pctTech: defs.pctTech,
    pctLicencia: defs.pctLicencia,
    pctGrupo: defs.pctGrupo,
    pctIva,
    grupoConsultantId: null,
    asignaciones: [],
    observaciones: '',
    calculo: calcularDistribucion({
      ingreso1aQna: 0,
      ingreso2daQna: 0,
      pctIva,
      ...defs,
      asignaciones: [],
    }),
    esBorrador: true,
  };
}

export async function previewCalculo(body) {
  return calcularDistribucion({
    ingreso1aQna: body.ingreso1aQna,
    ingreso2daQna: body.ingreso2daQna,
    pctTech: body.pctTech,
    pctLicencia: body.pctLicencia,
    pctGrupo: body.pctGrupo,
    pctIva: body.pctIva,
    asignaciones: body.asignaciones || [],
  });
}

export async function upsertDistribucion(datos, clerkUserId) {
  validarPeriodo(datos.periodo);
  if (!datos.projectId) throw new Error('projectId es obligatorio');

  const asignaciones = normalizarAsignaciones(datos.asignaciones || []);
  const payload = {
    projectId: datos.projectId,
    periodo: datos.periodo,
    ingreso1aQna: Number(datos.ingreso1aQna) || 0,
    ingreso2daQna: Number(datos.ingreso2daQna) || 0,
    pctTech: Number(datos.pctTech),
    pctLicencia: Number(datos.pctLicencia),
    pctGrupo: Number(datos.pctGrupo),
    pctIva: datos.pctIva !== undefined ? Number(datos.pctIva) : 0.16,
    grupoConsultantId: datos.grupoConsultantId || null,
    asignaciones,
    observaciones: String(datos.observaciones || '').trim(),
    updatedBy: clerkUserId,
  };

  if ([payload.pctTech, payload.pctLicencia, payload.pctGrupo].some((v) => !Number.isFinite(v))) {
    throw new Error('Porcentajes TECH/LICENCIA/GRUPO inválidos');
  }

  const doc = await MonthlyDistribution.findOneAndUpdate(
    { projectId: payload.projectId, periodo: payload.periodo },
    {
      $set: payload,
      $setOnInsert: { createdBy: clerkUserId },
    },
    { upsert: true, new: true, runValidators: true }
  );

  return enriquecerConCalculo(doc);
}

export async function eliminarDistribucion(id) {
  return MonthlyDistribution.findByIdAndDelete(id);
}

export async function listarDistribuciones({ periodo, projectId } = {}) {
  const filtro = {};
  if (periodo) {
    validarPeriodo(periodo);
    filtro.periodo = periodo;
  }
  if (projectId) filtro.projectId = projectId;

  const docs = await MonthlyDistribution.find(filtro)
    .populate('projectId', 'nombre cliente')
    .populate('asignaciones.consultantId', 'nombre')
    .populate('grupoConsultantId', 'nombre')
    .sort({ periodo: -1 })
    .lean();

  return docs.map((d) => enriquecerConCalculo(d));
}

/** Vista consolidada tipo Excel para un periodo. */
export async function reporteMensual(periodo) {
  validarPeriodo(periodo);
  const [proyectos, consultores, dists] = await Promise.all([
    HonorarioProject.find({ activo: true }).sort({ nombre: 1 }).lean(),
    Consultant.find({ activo: true }).sort({ nombre: 1 }).lean(),
    MonthlyDistribution.find({ periodo })
      .populate('asignaciones.consultantId', 'nombre')
      .populate('grupoConsultantId', 'nombre')
      .lean(),
  ]);

  const porProyecto = new Map(dists.map((d) => [String(d.projectId), d]));
  const filas = [];

  for (const p of proyectos) {
    const d = porProyecto.get(String(p._id));
    if (!d) continue;
    const calc = calcularDistribucion({
      ingreso1aQna: d.ingreso1aQna,
      ingreso2daQna: d.ingreso2daQna,
      pctTech: d.pctTech,
      pctLicencia: d.pctLicencia,
      pctGrupo: d.pctGrupo,
      pctIva: d.pctIva,
      asignaciones: (d.asignaciones || []).map((a) => ({
        consultantId: a.consultantId?._id || a.consultantId,
        rol: a.rol,
        pct: a.pct,
      })),
    });

    const porConsultor = {};
    for (const c of consultores) {
      porConsultor[String(c._id)] = {
        FINDER: 0,
        CLOSER: 0,
        EJECUCION: 0,
        GRUPO: 0,
        total: 0,
        q1: 0,
        q2: 0,
      };
    }

    for (const a of calc.asignaciones) {
      const id = String(a.consultantId);
      if (!porConsultor[id]) continue;
      porConsultor[id][a.rol] += a.monto;
      porConsultor[id].total += a.monto;
      const q = prorratearQuincenas(a.monto, d.ingreso1aQna, d.ingreso2daQna);
      porConsultor[id].q1 += q.q1;
      porConsultor[id].q2 += q.q2;
    }

    const grupoId = d.grupoConsultantId
      ? String(d.grupoConsultantId._id || d.grupoConsultantId)
      : null;
    if (grupoId && porConsultor[grupoId]) {
      porConsultor[grupoId].GRUPO += calc.montoGrupo;
      porConsultor[grupoId].total += calc.montoGrupo;
      const q = prorratearQuincenas(calc.montoGrupo, d.ingreso1aQna, d.ingreso2daQna);
      porConsultor[grupoId].q1 += q.q1;
      porConsultor[grupoId].q2 += q.q2;
    }

    // Redondear presentación
    for (const id of Object.keys(porConsultor)) {
      const x = porConsultor[id];
      for (const k of Object.keys(x)) {
        x[k] = Math.round(x[k] * 100) / 100;
      }
    }

    filas.push({
      projectId: p._id,
      proyecto: p.nombre,
      ingreso1aQna: calc.ingreso1aQna,
      ingreso2daQna: calc.ingreso2daQna,
      ingresoTotal: calc.ingresoTotal,
      montoTech: calc.montoTech,
      montoLicencia: calc.montoLicencia,
      montoGrupo: calc.montoGrupo,
      netoDistribuible: calc.netoDistribuible,
      advertenciaPct: calc.advertenciaPct,
      porConsultor,
      diferenciaIngreso: calc.diferenciaIngreso,
    });
  }

  const totales = {
    ingreso1aQna: 0,
    ingreso2daQna: 0,
    ingresoTotal: 0,
    montoTech: 0,
    montoLicencia: 0,
    montoGrupo: 0,
    netoDistribuible: 0,
    porConsultor: {},
  };
  for (const c of consultores) {
    totales.porConsultor[String(c._id)] = {
      FINDER: 0,
      CLOSER: 0,
      EJECUCION: 0,
      GRUPO: 0,
      total: 0,
      q1: 0,
      q2: 0,
    };
  }
  for (const f of filas) {
    for (const k of [
      'ingreso1aQna',
      'ingreso2daQna',
      'ingresoTotal',
      'montoTech',
      'montoLicencia',
      'montoGrupo',
      'netoDistribuible',
    ]) {
      totales[k] += f[k];
    }
    for (const [id, vals] of Object.entries(f.porConsultor)) {
      if (!totales.porConsultor[id]) continue;
      for (const k of Object.keys(vals)) {
        totales.porConsultor[id][k] += vals[k];
      }
    }
  }
  for (const k of Object.keys(totales)) {
    if (typeof totales[k] === 'number') totales[k] = Math.round(totales[k] * 100) / 100;
  }
  for (const id of Object.keys(totales.porConsultor)) {
    for (const k of Object.keys(totales.porConsultor[id])) {
      totales.porConsultor[id][k] =
        Math.round(totales.porConsultor[id][k] * 100) / 100;
    }
  }

  return {
    periodo,
    consultores: consultores.map((c) => ({ _id: c._id, nombre: c.nombre })),
    filas,
    totales,
  };
}

export async function reporteConsultor(consultantId, { desde, hasta } = {}) {
  if (!consultantId) throw new Error('consultantId es obligatorio');
  const consultor = await Consultant.findById(consultantId).lean();
  if (!consultor) throw new Error('Consultor no encontrado');

  const filtro = {};
  if (desde || hasta) {
    filtro.periodo = {};
    if (desde) {
      validarPeriodo(desde);
      filtro.periodo.$gte = desde;
    }
    if (hasta) {
      validarPeriodo(hasta);
      filtro.periodo.$lte = hasta;
    }
  }

  const dists = await MonthlyDistribution.find(filtro)
    .populate('projectId', 'nombre')
    .lean();

  const desglose = [];
  let total = 0;

  for (const d of dists) {
    const calc = calcularDistribucion({
      ingreso1aQna: d.ingreso1aQna,
      ingreso2daQna: d.ingreso2daQna,
      pctTech: d.pctTech,
      pctLicencia: d.pctLicencia,
      pctGrupo: d.pctGrupo,
      pctIva: d.pctIva,
      asignaciones: (d.asignaciones || []).map((a) => ({
        consultantId: String(a.consultantId),
        rol: a.rol,
        pct: a.pct,
      })),
    });

    for (const a of calc.asignaciones) {
      if (String(a.consultantId) !== String(consultantId)) continue;
      const q = prorratearQuincenas(a.monto, d.ingreso1aQna, d.ingreso2daQna);
      desglose.push({
        periodo: d.periodo,
        proyecto: d.projectId?.nombre || '',
        projectId: d.projectId?._id || d.projectId,
        rol: a.rol,
        pct: a.pct,
        monto: a.monto,
        q1: q.q1,
        q2: q.q2,
      });
      total += a.monto;
    }

    const grupoId = d.grupoConsultantId ? String(d.grupoConsultantId) : null;
    if (grupoId === String(consultantId) && calc.montoGrupo > 0) {
      const q = prorratearQuincenas(calc.montoGrupo, d.ingreso1aQna, d.ingreso2daQna);
      desglose.push({
        periodo: d.periodo,
        proyecto: d.projectId?.nombre || '',
        projectId: d.projectId?._id || d.projectId,
        rol: 'GRUPO',
        pct: d.pctGrupo,
        monto: calc.montoGrupo,
        q1: q.q1,
        q2: q.q2,
      });
      total += calc.montoGrupo;
    }
  }

  desglose.sort((a, b) =>
    a.periodo === b.periodo
      ? a.proyecto.localeCompare(b.proyecto)
      : a.periodo.localeCompare(b.periodo)
  );

  return {
    consultor: { _id: consultor._id, nombre: consultor.nombre },
    desde: desde || null,
    hasta: hasta || null,
    desglose,
    total: Math.round(total * 100) / 100,
  };
}

export async function reporteIngresos({ desde, hasta } = {}) {
  const filtro = {};
  if (desde || hasta) {
    filtro.periodo = {};
    if (desde) {
      validarPeriodo(desde);
      filtro.periodo.$gte = desde;
    }
    if (hasta) {
      validarPeriodo(hasta);
      filtro.periodo.$lte = hasta;
    }
  }

  const dists = await MonthlyDistribution.find(filtro)
    .populate('projectId', 'nombre')
    .lean();

  const porMes = new Map();
  const porProyecto = [];

  for (const d of dists) {
    const calc = calcularDistribucion({
      ingreso1aQna: d.ingreso1aQna,
      ingreso2daQna: d.ingreso2daQna,
      pctTech: d.pctTech,
      pctLicencia: d.pctLicencia,
      pctGrupo: d.pctGrupo,
      pctIva: d.pctIva,
      asignaciones: [],
    });

    if (!porMes.has(d.periodo)) {
      porMes.set(d.periodo, {
        periodo: d.periodo,
        ingresoTotal: 0,
        montoTech: 0,
        montoLicencia: 0,
        montoGrupo: 0,
        netoDistribuible: 0,
      });
    }
    const m = porMes.get(d.periodo);
    m.ingresoTotal += calc.ingresoTotal;
    m.montoTech += calc.montoTech;
    m.montoLicencia += calc.montoLicencia;
    m.montoGrupo += calc.montoGrupo;
    m.netoDistribuible += calc.netoDistribuible;

    porProyecto.push({
      periodo: d.periodo,
      proyecto: d.projectId?.nombre || '',
      projectId: d.projectId?._id || d.projectId,
      ingreso1aQna: calc.ingreso1aQna,
      ingreso2daQna: calc.ingreso2daQna,
      ingresoTotal: calc.ingresoTotal,
      montoTech: calc.montoTech,
      montoLicencia: calc.montoLicencia,
      montoGrupo: calc.montoGrupo,
      netoDistribuible: calc.netoDistribuible,
    });
  }

  const meses = [...porMes.values()]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((m) => ({
      ...m,
      ingresoTotal: Math.round(m.ingresoTotal * 100) / 100,
      montoTech: Math.round(m.montoTech * 100) / 100,
      montoLicencia: Math.round(m.montoLicencia * 100) / 100,
      montoGrupo: Math.round(m.montoGrupo * 100) / 100,
      netoDistribuible: Math.round(m.netoDistribuible * 100) / 100,
    }));

  const granTotal = meses.reduce(
    (acc, m) => ({
      ingresoTotal: acc.ingresoTotal + m.ingresoTotal,
      montoTech: acc.montoTech + m.montoTech,
      montoLicencia: acc.montoLicencia + m.montoLicencia,
      montoGrupo: acc.montoGrupo + m.montoGrupo,
      netoDistribuible: acc.netoDistribuible + m.netoDistribuible,
    }),
    { ingresoTotal: 0, montoTech: 0, montoLicencia: 0, montoGrupo: 0, netoDistribuible: 0 }
  );
  for (const k of Object.keys(granTotal)) {
    granTotal[k] = Math.round(granTotal[k] * 100) / 100;
  }

  return { desde: desde || null, hasta: hasta || null, meses, porProyecto, granTotal };
}

export async function exportarMensualXlsx(periodo) {
  const reporte = await reporteMensual(periodo);
  const columnas = [
    'Proyecto',
    '1A Qna',
    '2da Qna',
    'TECH',
    'LICENCIA',
    'GRUPO',
    'Neto distribuible',
  ];
  for (const c of reporte.consultores) {
    columnas.push(`${c.nombre} Finder`);
    columnas.push(`${c.nombre} Closer`);
    columnas.push(`${c.nombre} Ejecución`);
    columnas.push(`${c.nombre} Grupo`);
    columnas.push(`${c.nombre} Total`);
  }

  const filas = reporte.filas.map((f) => {
    const row = {
      Proyecto: f.proyecto,
      '1A Qna': f.ingreso1aQna,
      '2da Qna': f.ingreso2daQna,
      TECH: f.montoTech,
      LICENCIA: f.montoLicencia,
      GRUPO: f.montoGrupo,
      'Neto distribuible': f.netoDistribuible,
    };
    for (const c of reporte.consultores) {
      const v = f.porConsultor[String(c._id)] || {
        FINDER: 0,
        CLOSER: 0,
        EJECUCION: 0,
        GRUPO: 0,
        total: 0,
      };
      row[`${c.nombre} Finder`] = v.FINDER;
      row[`${c.nombre} Closer`] = v.CLOSER;
      row[`${c.nombre} Ejecución`] = v.EJECUCION;
      row[`${c.nombre} Grupo`] = v.GRUPO;
      row[`${c.nombre} Total`] = v.total;
    }
    return row;
  });

  // Totales
  const tot = {
    Proyecto: 'TOTAL',
    '1A Qna': reporte.totales.ingreso1aQna,
    '2da Qna': reporte.totales.ingreso2daQna,
    TECH: reporte.totales.montoTech,
    LICENCIA: reporte.totales.montoLicencia,
    GRUPO: reporte.totales.montoGrupo,
    'Neto distribuible': reporte.totales.netoDistribuible,
  };
  for (const c of reporte.consultores) {
    const v = reporte.totales.porConsultor[String(c._id)] || {
      FINDER: 0,
      CLOSER: 0,
      EJECUCION: 0,
      GRUPO: 0,
      total: 0,
    };
    tot[`${c.nombre} Finder`] = v.FINDER;
    tot[`${c.nombre} Closer`] = v.CLOSER;
    tot[`${c.nombre} Ejecución`] = v.EJECUCION;
    tot[`${c.nombre} Grupo`] = v.GRUPO;
    tot[`${c.nombre} Total`] = v.total;
  }
  filas.push(tot);

  return generarExcel({
    nombreHoja: periodo,
    columnas,
    filas,
  });
}

export { defaultsPorPeriodo, ROLES_HONORARIO };
