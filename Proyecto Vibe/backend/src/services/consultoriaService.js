import { Consultant } from '../models/Consultant.js';
import { ConsultoriaCliente } from '../models/ConsultoriaCliente.js';
import { ConsultoriaPropuesta } from '../models/ConsultoriaPropuesta.js';
import { ConsultoriaProyecto } from '../models/ConsultoriaProyecto.js';
import { ConsultoriaAuditLog } from '../models/ConsultoriaAuditLog.js';
import {
  PROCESOS_PROPUESTA,
  STATUS_PROPUESTA,
  STATUS_PROYECTO,
  TIPOS_CLIENTE,
  TIPOS_PROYECTO,
  ROLES_PROYECTO,
  UBICACIONES_CONSULTORIA,
  DEFAULT_PCT_IVA_CONSULTORIA,
} from '../utils/consultoriaConstants.js';
import {
  redondearPesos,
  toCents,
  fromCents,
  validarPctCompartido,
} from '../utils/consultoriaMotor.js';

async function registrarAudit({
  userId,
  userEmail,
  entidad,
  entidadId,
  accion,
  campo = '',
  valorAnterior = null,
  valorNuevo = null,
  justificacion = '',
}) {
  await ConsultoriaAuditLog.create({
    userId: userId || 'system',
    userEmail: userEmail || '',
    entidad,
    entidadId: String(entidadId),
    accion,
    campo,
    valorAnterior,
    valorNuevo,
    justificacion,
  });
}

function clerkMeta(usuario) {
  return {
    userId: usuario?.clerkUserId || usuario?._id || 'system',
    userEmail: usuario?.email || '',
  };
}

function redondearMontoONull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('monto inválido');
  return redondearPesos(n);
}

// ---- Consultores (reutiliza Honorarios) ----
export async function listarConsultores({ activos } = {}) {
  const filtro = {};
  if (activos === 'true' || activos === true) filtro.activo = true;
  return Consultant.find(filtro).sort({ nombre: 1 }).lean();
}

// ---- Clientes ----
export async function listarClientes({ activos, ubicacion, q } = {}) {
  const filtro = {};
  if (activos === 'true' || activos === true) filtro.activo = true;
  if (ubicacion) filtro.ubicacion = ubicacion;
  if (q) filtro.nombre = { $regex: String(q).trim(), $options: 'i' };
  return ConsultoriaCliente.find(filtro).sort({ nombre: 1 }).lean();
}

export async function crearCliente(datos, usuario) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('nombre es obligatorio');
  const ubicacion = datos.ubicacion || 'OTROS';
  if (!UBICACIONES_CONSULTORIA.includes(ubicacion)) {
    throw new Error(`ubicación inválida: ${ubicacion}`);
  }
  const tipoCliente = datos.tipoCliente || 'NUEVO';
  if (!TIPOS_CLIENTE.includes(tipoCliente)) {
    throw new Error(`tipoCliente inválido: ${tipoCliente}`);
  }

  const doc = await ConsultoriaCliente.create({
    nombre,
    ubicacion,
    tipoCliente,
    razonSocialFactura: String(datos.razonSocialFactura || '').trim(),
    activo: datos.activo !== false,
    notas: String(datos.notas || '').trim(),
  });

  const meta = clerkMeta(usuario);
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaCliente',
    entidadId: doc._id,
    accion: 'CREATE',
    valorNuevo: { nombre, ubicacion, tipoCliente },
  });
  return doc.toObject();
}

export async function actualizarCliente(id, datos, usuario) {
  const doc = await ConsultoriaCliente.findById(id);
  if (!doc) return null;

  const antes = doc.toObject();
  if (datos.nombre !== undefined) doc.nombre = String(datos.nombre).trim();
  if (datos.ubicacion !== undefined) {
    if (!UBICACIONES_CONSULTORIA.includes(datos.ubicacion)) {
      throw new Error(`ubicación inválida: ${datos.ubicacion}`);
    }
    doc.ubicacion = datos.ubicacion;
  }
  if (datos.tipoCliente !== undefined) {
    if (!TIPOS_CLIENTE.includes(datos.tipoCliente)) {
      throw new Error(`tipoCliente inválido: ${datos.tipoCliente}`);
    }
    doc.tipoCliente = datos.tipoCliente;
  }
  if (datos.razonSocialFactura !== undefined) {
    doc.razonSocialFactura = String(datos.razonSocialFactura).trim();
  }
  if (datos.activo !== undefined) doc.activo = Boolean(datos.activo);
  if (datos.notas !== undefined) doc.notas = String(datos.notas).trim();

  await doc.save();
  const meta = clerkMeta(usuario);
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaCliente',
    entidadId: doc._id,
    accion: 'UPDATE',
    valorAnterior: { nombre: antes.nombre, status: antes.activo },
    valorNuevo: { nombre: doc.nombre, activo: doc.activo },
  });
  return doc.toObject();
}

async function upsertClientePorNombre(nombre, extras = {}) {
  const n = String(nombre || '').trim();
  if (!n) throw new Error('nombre de cliente vacío');
  return ConsultoriaCliente.findOneAndUpdate(
    { nombre: n },
    {
      $set: {
        nombre: n,
        activo: true,
        ubicacion: extras.ubicacion || 'OTROS',
        tipoCliente: extras.tipoCliente || 'NUEVO',
        ...('razonSocialFactura' in extras
          ? { razonSocialFactura: extras.razonSocialFactura }
          : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, collation: { locale: 'es', strength: 2 } }
  );
}

async function consultorPorNombre(nombre) {
  if (!nombre || /^n\/?a$/i.test(String(nombre).trim())) return null;
  const doc = await Consultant.findOne({ nombre: String(nombre).trim() }).collation({
    locale: 'es',
    strength: 2,
  });
  if (!doc) throw new Error(`Consultor no encontrado: ${nombre}`);
  return doc;
}

// ---- Propuestas ----
function popularPropuesta(q) {
  return q
    .populate('liderId', 'nombre')
    .populate('liderSecundarioId', 'nombre')
    .populate('finderId', 'nombre')
    .populate('clienteId', 'nombre ubicacion tipoCliente');
}

export async function listarPropuestas(filtros = {}) {
  const filtro = {};
  if (filtros.anio) filtro.anio = Number(filtros.anio);
  if (filtros.mes) filtro.mes = Number(filtros.mes);
  if (filtros.ubicacion) filtro.ubicacion = filtros.ubicacion;
  if (filtros.status) filtro.status = filtros.status;
  if (filtros.liderId) filtro.liderId = filtros.liderId;
  if (filtros.finderId) filtro.finderId = filtros.finderId;
  if (filtros.clienteId) filtro.clienteId = filtros.clienteId;
  if (filtros.proceso) filtro.proceso = filtros.proceso;

  const docs = await popularPropuesta(
    ConsultoriaPropuesta.find(filtro).sort({ anio: -1, mes: -1, numeroConsecutivo: 1 })
  ).lean();

  return docs;
}

export async function obtenerPropuesta(id) {
  return popularPropuesta(ConsultoriaPropuesta.findById(id)).lean();
}

export async function resumenPropuestas(filtros = {}) {
  const docs = await listarPropuestas(filtros);
  const total = docs.length;
  let montoTotalCents = 0;
  let conMonto = 0;
  let ganadas = 0;
  let nuevos = 0;
  let recurrentes = 0;
  const porStatus = Object.fromEntries(STATUS_PROPUESTA.map((s) => [s, 0]));
  const porUbicacion = {};
  const porProceso = {};

  for (const p of docs) {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1;
    if (p.status === 'GANADA') ganadas += 1;
    if (p.monto != null) {
      montoTotalCents += toCents(p.monto);
      conMonto += 1;
    }
    const ubi = p.ubicacion || 'OTROS';
    porUbicacion[ubi] = (porUbicacion[ubi] || 0) + 1;
    const proc = p.proceso || 'OTRO';
    porProceso[proc] = (porProceso[proc] || 0) + 1;
    const tipo = p.clienteId?.tipoCliente;
    if (tipo === 'NUEVO') nuevos += 1;
    if (tipo === 'RECURRENTE') recurrentes += 1;
  }

  return {
    total,
    montoTotal: fromCents(montoTotalCents),
    conMonto,
    pctGanadas: total ? Math.round((ganadas / total) * 10000) / 10000 : null,
    pctNuevos: total ? Math.round((nuevos / total) * 10000) / 10000 : null,
    pctRecurrentes: total ? Math.round((recurrentes / total) * 10000) / 10000 : null,
    porStatus,
    porUbicacion,
    porProceso,
  };
}

async function siguienteConsecutivo(anio, mes) {
  const last = await ConsultoriaPropuesta.findOne({ anio, mes })
    .sort({ numeroConsecutivo: -1 })
    .select('numeroConsecutivo')
    .lean();
  return (last?.numeroConsecutivo || 0) + 1;
}

function normalizarPayloadPropuesta(datos, { paraCrear } = {}) {
  const anio = Number(datos.anio);
  const mes = Number(datos.mes);
  if (!Number.isInteger(anio) || anio < 2020) throw new Error('año inválido');
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('mes inválido');

  const ubicacion = datos.ubicacion;
  if (!UBICACIONES_CONSULTORIA.includes(ubicacion)) {
    throw new Error(`ubicación inválida: ${ubicacion}`);
  }
  if (!datos.liderId) throw new Error('liderId es obligatorio');
  if (!datos.clienteId) throw new Error('clienteId es obligatorio');

  const proceso = datos.proceso;
  if (!PROCESOS_PROPUESTA.includes(proceso)) {
    throw new Error(`proceso inválido: ${proceso}`);
  }

  const status = datos.status || 'PROSPECTO';
  if (!STATUS_PROPUESTA.includes(status)) {
    throw new Error(`status inválido: ${status}`);
  }

  const payload = {
    anio,
    mes,
    ubicacion,
    liderId: datos.liderId,
    liderSecundarioId: datos.liderSecundarioId || null,
    finderId: datos.finderId || null,
    clienteId: datos.clienteId,
    tiempoEstimado: String(datos.tiempoEstimado || '').trim(),
    proceso,
    procesoDetalle: String(datos.procesoDetalle || '').trim(),
    monto: redondearMontoONull(datos.monto),
    pctIva:
      datos.pctIva !== undefined && datos.pctIva !== null && datos.pctIva !== ''
        ? Number(datos.pctIva)
        : DEFAULT_PCT_IVA_CONSULTORIA,
    status,
    notas: String(datos.notas || '').trim(),
  };

  if (datos.fechaRegistro) payload.fechaRegistro = new Date(datos.fechaRegistro);
  if (paraCrear && datos.numeroConsecutivo != null) {
    payload.numeroConsecutivo = Number(datos.numeroConsecutivo);
  }

  return payload;
}

export async function crearPropuesta(datos, usuario) {
  const payload = normalizarPayloadPropuesta(datos, { paraCrear: true });
  if (!payload.numeroConsecutivo) {
    payload.numeroConsecutivo = await siguienteConsecutivo(payload.anio, payload.mes);
  }

  const meta = clerkMeta(usuario);
  payload.createdBy = meta.userId;
  payload.updatedBy = meta.userId;

  const doc = await ConsultoriaPropuesta.create(payload);
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaPropuesta',
    entidadId: doc._id,
    accion: 'CREATE',
    valorNuevo: {
      anio: doc.anio,
      mes: doc.mes,
      numeroConsecutivo: doc.numeroConsecutivo,
      status: doc.status,
      monto: doc.monto,
    },
  });

  return obtenerPropuesta(doc._id);
}

export async function actualizarPropuesta(id, datos, usuario) {
  const doc = await ConsultoriaPropuesta.findById(id);
  if (!doc) return null;

  const antes = {
    status: doc.status,
    monto: doc.monto,
    liderId: String(doc.liderId),
    clienteId: String(doc.clienteId),
  };

  const payload = normalizarPayloadPropuesta(
    {
      anio: datos.anio ?? doc.anio,
      mes: datos.mes ?? doc.mes,
      ubicacion: datos.ubicacion ?? doc.ubicacion,
      liderId: datos.liderId ?? doc.liderId,
      liderSecundarioId:
        datos.liderSecundarioId !== undefined ? datos.liderSecundarioId : doc.liderSecundarioId,
      finderId: datos.finderId !== undefined ? datos.finderId : doc.finderId,
      clienteId: datos.clienteId ?? doc.clienteId,
      tiempoEstimado: datos.tiempoEstimado !== undefined ? datos.tiempoEstimado : doc.tiempoEstimado,
      proceso: datos.proceso ?? doc.proceso,
      procesoDetalle: datos.procesoDetalle !== undefined ? datos.procesoDetalle : doc.procesoDetalle,
      monto: datos.monto !== undefined ? datos.monto : doc.monto,
      pctIva: datos.pctIva !== undefined ? datos.pctIva : doc.pctIva,
      status: datos.status ?? doc.status,
      notas: datos.notas !== undefined ? datos.notas : doc.notas,
      fechaRegistro: datos.fechaRegistro,
    },
    { paraCrear: false }
  );

  // No cambiar consecutivo en update salvo explícito
  if (datos.numeroConsecutivo != null) {
    doc.numeroConsecutivo = Number(datos.numeroConsecutivo);
  }

  Object.assign(doc, payload);
  const meta = clerkMeta(usuario);
  doc.updatedBy = meta.userId;
  await doc.save();

  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaPropuesta',
    entidadId: doc._id,
    accion: 'UPDATE',
    valorAnterior: antes,
    valorNuevo: {
      status: doc.status,
      monto: doc.monto,
      liderId: String(doc.liderId),
      clienteId: String(doc.clienteId),
    },
    justificacion: String(datos.justificacion || '').trim(),
  });

  return obtenerPropuesta(doc._id);
}

export async function eliminarPropuesta(id, usuario) {
  const doc = await ConsultoriaPropuesta.findByIdAndDelete(id);
  if (!doc) return null;
  const meta = clerkMeta(usuario);
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaPropuesta',
    entidadId: id,
    accion: 'DELETE',
    valorAnterior: {
      anio: doc.anio,
      mes: doc.mes,
      numeroConsecutivo: doc.numeroConsecutivo,
      status: doc.status,
    },
  });
  return { _id: id, eliminado: true };
}

export async function cambiarStatusPropuesta(id, status, usuario) {
  if (!STATUS_PROPUESTA.includes(status)) throw new Error(`status inválido: ${status}`);
  return actualizarPropuesta(id, { status }, usuario);
}

/**
 * Seed enero 2025 (Excel BWS). Idempotente por anio+mes+numeroConsecutivo.
 */
export async function seedPropuestasEnero2025(usuario) {
  // Asegurar Mario en catálogo Honorarios
  await Consultant.findOneAndUpdate(
    { nombre: 'Mario' },
    { $set: { nombre: 'Mario', activo: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true, collation: { locale: 'es', strength: 2 } }
  );

  const filas = [
    {
      numeroConsecutivo: 1,
      ubicacion: 'BAJA_CALIFORNIA',
      lider: 'AP',
      finder: 'AP',
      cliente: 'Heineken Tecate',
      tipoCliente: 'RECURRENTE',
      tiempoEstimado: '2 días',
      proceso: 'TEAM_BUILDING',
      monto: null,
      status: 'GANADA',
    },
    {
      numeroConsecutivo: 2,
      ubicacion: 'CUU',
      lider: 'AP',
      finder: 'AP',
      cliente: 'Interbandas',
      tipoCliente: 'NUEVO',
      tiempoEstimado: '3 meses',
      proceso: 'ALINEACION',
      procesoDetalle: 'Alineación_Coaching',
      monto: null,
      status: 'GANADA',
    },
    {
      numeroConsecutivo: 3,
      ubicacion: 'CUU',
      lider: 'Mario',
      liderSecundario: 'Ulises',
      finder: 'AP',
      cliente: 'Promédica',
      tipoCliente: 'NUEVO',
      tiempoEstimado: '1 día',
      proceso: 'TEAM_BUILDING',
      monto: 40000,
      status: 'GANADA',
    },
    {
      numeroConsecutivo: 4,
      ubicacion: 'MEOQUI',
      lider: 'Mario',
      finder: null,
      cliente: 'Heineken Meoqui',
      tipoCliente: 'RECURRENTE',
      tiempoEstimado: '2 días',
      proceso: 'TEAM_BUILDING',
      monto: 80000,
      status: 'GANADA',
    },
    {
      numeroConsecutivo: 5,
      ubicacion: 'JRZ',
      lider: 'AP',
      finder: 'AP',
      cliente: 'Boca Rosa',
      tipoCliente: 'NUEVO',
      tiempoEstimado: '',
      proceso: 'ESTRATEGIA',
      monto: null,
      status: 'PROSPECTO',
    },
    {
      numeroConsecutivo: 6,
      ubicacion: 'CUU',
      lider: 'AP',
      finder: 'Chava',
      cliente: 'Ichitaip',
      tipoCliente: 'NUEVO',
      tiempoEstimado: '',
      proceso: 'ESTRATEGIA',
      monto: null,
      status: 'PROSPECTO',
    },
    {
      numeroConsecutivo: 7,
      ubicacion: 'CUAUH',
      lider: 'AP',
      finder: 'Chava',
      cliente: 'SCELI',
      tipoCliente: 'NUEVO',
      tiempoEstimado: 'TBD',
      proceso: 'ESTRATEGIA',
      procesoDetalle: 'Estrategia_Achievement',
      monto: null,
      status: 'PROSPECTO',
    },
  ];

  const creadas = [];
  const actualizadas = [];

  for (const f of filas) {
    const cliente = await upsertClientePorNombre(f.cliente, {
      ubicacion: f.ubicacion,
      tipoCliente: f.tipoCliente,
    });
    const lider = await consultorPorNombre(f.lider);
    const liderSec = f.liderSecundario ? await consultorPorNombre(f.liderSecundario) : null;
    const finder = f.finder ? await consultorPorNombre(f.finder) : null;

    const existente = await ConsultoriaPropuesta.findOne({
      anio: 2025,
      mes: 1,
      numeroConsecutivo: f.numeroConsecutivo,
    });

    const payload = {
      anio: 2025,
      mes: 1,
      numeroConsecutivo: f.numeroConsecutivo,
      ubicacion: f.ubicacion,
      liderId: lider._id,
      liderSecundarioId: liderSec?._id || null,
      finderId: finder?._id || null,
      clienteId: cliente._id,
      tiempoEstimado: f.tiempoEstimado,
      proceso: f.proceso,
      procesoDetalle: f.procesoDetalle || '',
      monto: f.monto,
      status: f.status,
      pctIva: DEFAULT_PCT_IVA_CONSULTORIA,
    };

    if (existente) {
      Object.assign(existente, payload);
      await existente.save();
      actualizadas.push(existente._id);
    } else {
      const doc = await crearPropuesta(payload, usuario);
      creadas.push(doc._id);
    }
  }

  return {
    creadas: creadas.length,
    actualizadas: actualizadas.length,
    total: filas.length,
  };
}

// ---- Proyectos ----
function popularProyecto(q) {
  return q
    .populate('consultorId', 'nombre')
    .populate('consultorCompartidoId', 'nombre')
    .populate('clienteId', 'nombre ubicacion tipoCliente')
    .populate('propuestaId', 'numeroConsecutivo anio mes status monto');
}

export async function listarProyectos(filtros = {}) {
  const filtro = {};
  if (filtros.activos === 'true' || filtros.activos === true) filtro.activo = true;
  if (filtros.activos === 'false') filtro.activo = false;
  if (filtros.consultorId) {
    filtro.$or = [
      { consultorId: filtros.consultorId },
      { consultorCompartidoId: filtros.consultorId },
    ];
  }
  if (filtros.status) filtro.status = filtros.status;
  if (filtros.tipo) filtro.tipo = filtros.tipo;
  if (filtros.clienteId) filtro.clienteId = filtros.clienteId;
  if (filtros.rol) filtro.rol = filtros.rol;

  return popularProyecto(
    ConsultoriaProyecto.find(filtro).sort({ status: 1, descripcion: 1 })
  ).lean();
}

export async function obtenerProyecto(id) {
  return popularProyecto(ConsultoriaProyecto.findById(id)).lean();
}

export async function resumenProyectos(filtros = {}) {
  const docs = await listarProyectos({ ...filtros, activos: filtros.activos ?? 'true' });
  const porConsultor = {};
  const porStatus = Object.fromEntries(STATUS_PROYECTO.map((s) => [s, 0]));
  const porTipo = Object.fromEntries(TIPOS_PROYECTO.map((t) => [t, 0]));
  let montoTotal = 0;

  for (const p of docs) {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1;
    porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
    montoTotal += toCents(p.montoContratado);
    const cid = String(p.consultorId?._id || p.consultorId);
    const nombre = p.consultorId?.nombre || cid;
    if (!porConsultor[cid]) {
      porConsultor[cid] = {
        consultorId: cid,
        nombre,
        total: 0,
        porStatus: Object.fromEntries(STATUS_PROYECTO.map((s) => [s, 0])),
      };
    }
    porConsultor[cid].total += 1;
    porConsultor[cid].porStatus[p.status] += 1;
  }

  return {
    total: docs.length,
    montoContratadoTotal: fromCents(montoTotal),
    porStatus,
    porTipo,
    porConsultor: Object.values(porConsultor).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es')
    ),
  };
}

function normalizarPayloadProyecto(datos) {
  if (!datos.consultorId) throw new Error('consultorId es obligatorio');
  if (!datos.clienteId) throw new Error('clienteId es obligatorio');
  const descripcion = String(datos.descripcion || '').trim();
  if (!descripcion) throw new Error('descripción es obligatoria');

  const rol = datos.rol || 'LIDER';
  if (!ROLES_PROYECTO.includes(rol)) throw new Error(`rol inválido: ${rol}`);

  const tipo = datos.tipo || 'CONSULTORIA';
  if (!TIPOS_PROYECTO.includes(tipo)) throw new Error(`tipo inválido: ${tipo}`);

  const status = datos.status || 'INICIANDO';
  if (!STATUS_PROYECTO.includes(status)) throw new Error(`status inválido: ${status}`);

  let pctPrincipal = datos.pctConsultorPrincipal;
  let pctCompartido = datos.pctConsultorCompartido;
  if (rol === 'LIDER') {
    pctPrincipal = 1;
    pctCompartido = 0;
  } else {
    pctPrincipal = pctPrincipal !== undefined ? Number(pctPrincipal) : 0.5;
    pctCompartido = pctCompartido !== undefined ? Number(pctCompartido) : 0.5;
  }
  const pctCheck = validarPctCompartido(pctPrincipal, pctCompartido, rol);
  if (!pctCheck.ok) throw new Error(pctCheck.error);

  if (rol === 'COMPARTIDO' && !datos.consultorCompartidoId) {
    throw new Error('consultorCompartidoId es obligatorio cuando rol es COMPARTIDO');
  }

  const monto =
    datos.montoContratado === null || datos.montoContratado === undefined || datos.montoContratado === ''
      ? 0
      : redondearPesos(Number(datos.montoContratado));
  if (!Number.isFinite(monto) || monto < 0) throw new Error('montoContratado inválido');

  return {
    consultorId: datos.consultorId,
    rol,
    consultorCompartidoId: rol === 'COMPARTIDO' ? datos.consultorCompartidoId : null,
    pctConsultorPrincipal: pctCheck.pctPrincipal,
    pctConsultorCompartido: pctCheck.pctCompartido,
    clienteId: datos.clienteId,
    descripcion,
    tipo,
    status,
    propuestaId: datos.propuestaId || null,
    fechaInicio: datos.fechaInicio ? new Date(datos.fechaInicio) : null,
    fechaFinEstimada: datos.fechaFinEstimada ? new Date(datos.fechaFinEstimada) : null,
    fechaFinReal: datos.fechaFinReal ? new Date(datos.fechaFinReal) : null,
    montoContratado: monto,
    pctIva:
      datos.pctIva !== undefined && datos.pctIva !== null && datos.pctIva !== ''
        ? Number(datos.pctIva)
        : DEFAULT_PCT_IVA_CONSULTORIA,
    notas: String(datos.notas || '').trim(),
    activo: datos.activo !== false,
  };
}

export async function crearProyecto(datos, usuario) {
  const payload = normalizarPayloadProyecto(datos);
  const meta = clerkMeta(usuario);
  payload.createdBy = meta.userId;
  payload.updatedBy = meta.userId;
  const doc = await ConsultoriaProyecto.create(payload);
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaProyecto',
    entidadId: doc._id,
    accion: 'CREATE',
    valorNuevo: {
      descripcion: doc.descripcion,
      status: doc.status,
      consultorId: String(doc.consultorId),
    },
  });
  return obtenerProyecto(doc._id);
}

export async function actualizarProyecto(id, datos, usuario) {
  const doc = await ConsultoriaProyecto.findById(id);
  if (!doc) return null;
  const antes = { status: doc.status, descripcion: doc.descripcion, rol: doc.rol };

  const merged = {
    consultorId: datos.consultorId ?? doc.consultorId,
    rol: datos.rol ?? doc.rol,
    consultorCompartidoId:
      datos.consultorCompartidoId !== undefined
        ? datos.consultorCompartidoId
        : doc.consultorCompartidoId,
    pctConsultorPrincipal:
      datos.pctConsultorPrincipal !== undefined
        ? datos.pctConsultorPrincipal
        : doc.pctConsultorPrincipal,
    pctConsultorCompartido:
      datos.pctConsultorCompartido !== undefined
        ? datos.pctConsultorCompartido
        : doc.pctConsultorCompartido,
    clienteId: datos.clienteId ?? doc.clienteId,
    descripcion: datos.descripcion ?? doc.descripcion,
    tipo: datos.tipo ?? doc.tipo,
    status: datos.status ?? doc.status,
    propuestaId: datos.propuestaId !== undefined ? datos.propuestaId : doc.propuestaId,
    fechaInicio: datos.fechaInicio !== undefined ? datos.fechaInicio : doc.fechaInicio,
    fechaFinEstimada:
      datos.fechaFinEstimada !== undefined ? datos.fechaFinEstimada : doc.fechaFinEstimada,
    fechaFinReal: datos.fechaFinReal !== undefined ? datos.fechaFinReal : doc.fechaFinReal,
    montoContratado:
      datos.montoContratado !== undefined ? datos.montoContratado : doc.montoContratado,
    pctIva: datos.pctIva !== undefined ? datos.pctIva : doc.pctIva,
    notas: datos.notas !== undefined ? datos.notas : doc.notas,
    activo: datos.activo !== undefined ? datos.activo : doc.activo,
  };

  const payload = normalizarPayloadProyecto(merged);
  Object.assign(doc, payload);
  const meta = clerkMeta(usuario);
  doc.updatedBy = meta.userId;
  await doc.save();

  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaProyecto',
    entidadId: doc._id,
    accion: 'UPDATE',
    valorAnterior: antes,
    valorNuevo: { status: doc.status, descripcion: doc.descripcion, rol: doc.rol },
    justificacion: String(datos.justificacion || '').trim(),
  });
  return obtenerProyecto(doc._id);
}

export async function eliminarProyecto(id, usuario) {
  const doc = await ConsultoriaProyecto.findByIdAndDelete(id);
  if (!doc) return null;
  const meta = clerkMeta(usuario);
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaProyecto',
    entidadId: id,
    accion: 'DELETE',
    valorAnterior: { descripcion: doc.descripcion, status: doc.status },
  });
  return { _id: id, eliminado: true };
}

export async function cambiarStatusProyecto(id, status, usuario) {
  if (!STATUS_PROYECTO.includes(status)) throw new Error(`status inválido: ${status}`);
  const extra = {};
  if (status === 'TERMINADO') extra.fechaFinReal = new Date();
  return actualizarProyecto(id, { status, ...extra }, usuario);
}

export async function agregarNotaProyecto(id, nota, usuario) {
  const doc = await ConsultoriaProyecto.findById(id);
  if (!doc) return null;
  const linea = String(nota || '').trim();
  if (!linea) throw new Error('nota vacía');
  const stamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  doc.notas = doc.notas ? `${doc.notas}\n[${stamp}] ${linea}` : `[${stamp}] ${linea}`;
  const meta = clerkMeta(usuario);
  doc.updatedBy = meta.userId;
  await doc.save();
  await registrarAudit({
    ...meta,
    entidad: 'ConsultoriaProyecto',
    entidadId: id,
    accion: 'UPDATE',
    campo: 'notas',
    valorNuevo: linea,
  });
  return obtenerProyecto(id);
}

/**
 * Seed extracto de operación (Excel BWS). Idempotente por consultor+cliente+descripción.
 */
export async function seedProyectosOperacion(usuario) {
  await Consultant.findOneAndUpdate(
    { nombre: 'Mario' },
    { $set: { nombre: 'Mario', activo: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true, collation: { locale: 'es', strength: 2 } }
  );

  const filas = [
    // Ulises
    { consultor: 'Ulises', cliente: 'Water House', descripcion: 'Water House - Comité Estratégico', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'Ulises', cliente: 'Factor Global', descripcion: 'Factor Global', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'COMPARTIDO', compartido: 'AP', pctP: 0.5, pctC: 0.5 },
    { consultor: 'Ulises', cliente: 'Intermex', descripcion: 'Intermex', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'Ulises', cliente: 'Heineken Tecate', descripcion: 'Heineken team building', tipo: 'CONSULTORIA', status: 'TERMINADO', rol: 'COMPARTIDO', compartido: 'AP', pctP: 0.5, pctC: 0.5 },
    { consultor: 'Ulises', cliente: 'Promédica', descripcion: 'ProMedica', tipo: 'CONSULTORIA', status: 'TERMINADO', rol: 'COMPARTIDO', compartido: 'Mario', pctP: 0.5, pctC: 0.5 },
    { consultor: 'Ulises', cliente: 'JCAS', descripcion: 'JCAS', tipo: 'CONSULTORIA', status: 'INICIANDO', rol: 'LIDER' },
    { consultor: 'Ulises', cliente: 'Positano', descripcion: 'Positano gobierno corporativo', tipo: 'CONSULTORIA', status: 'INICIANDO', rol: 'COMPARTIDO', compartido: 'AP', pctP: 0.5, pctC: 0.5 },
    { consultor: 'Ulises', cliente: 'Circle K', descripcion: 'Circle K', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'COMPARTIDO', compartido: 'AP', pctP: 0.5, pctC: 0.5 },
    { consultor: 'Ulises', cliente: 'Templer', descripcion: 'Templer', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'Ulises', cliente: 'Demek', descripcion: 'Demek', tipo: 'PLATAFORMA', status: 'INICIANDO', rol: 'LIDER' },
    { consultor: 'Ulises', cliente: 'Index', descripcion: 'Index', tipo: 'PLATAFORMA', status: 'INICIANDO', rol: 'LIDER' },
    { consultor: 'Ulises', cliente: 'Fundación Index', descripcion: 'Fundación Index', tipo: 'PLATAFORMA', status: 'EN_PROCESO', rol: 'LIDER' },
    // AP (extracto)
    { consultor: 'AP', cliente: 'Novamex', descripcion: 'Novamex', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Copachisa', descripcion: 'Copachisa', tipo: 'PLATAFORMA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'AF', descripcion: 'AF', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Grupo Beh', descripcion: 'Grupo Beh', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Amexcap', descripcion: 'Amexcap', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Eludesa', descripcion: 'Eludesa', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Fechac', descripcion: 'Fechac', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Interbandas', descripcion: 'Interbandas', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Coder', descripcion: 'Coder', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'WHG', descripcion: 'WHG', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Coparmex', descripcion: 'Coparmex (múltiples plazas)', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
    { consultor: 'AP', cliente: 'Maple Bear', descripcion: 'Maple Bear', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'COMPARTIDO', compartido: 'Elsa', pctP: 0.5, pctC: 0.5 },
    // Elsa
    { consultor: 'Elsa', cliente: 'Maple Bear', descripcion: 'Maple Bear', tipo: 'CONSULTORIA', status: 'EN_PROCESO', rol: 'LIDER' },
  ];

  let creadas = 0;
  let actualizadas = 0;

  for (const f of filas) {
    const consultor = await consultorPorNombre(f.consultor);
    const cliente = await upsertClientePorNombre(f.cliente, {
      ubicacion: 'CUU',
      tipoCliente: 'RECURRENTE',
    });
    const compartido = f.compartido ? await consultorPorNombre(f.compartido) : null;

    const existente = await ConsultoriaProyecto.findOne({
      consultorId: consultor._id,
      clienteId: cliente._id,
      descripcion: f.descripcion,
    });

    const payload = {
      consultorId: consultor._id,
      clienteId: cliente._id,
      descripcion: f.descripcion,
      tipo: f.tipo,
      status: f.status,
      rol: f.rol,
      consultorCompartidoId: compartido?._id || null,
      pctConsultorPrincipal: f.pctP ?? (f.rol === 'LIDER' ? 1 : 0.5),
      pctConsultorCompartido: f.pctC ?? (f.rol === 'LIDER' ? 0 : 0.5),
      montoContratado: 0,
      activo: true,
    };

    if (existente) {
      await actualizarProyecto(String(existente._id), payload, usuario);
      actualizadas += 1;
    } else {
      await crearProyecto(payload, usuario);
      creadas += 1;
    }
  }

  return { creadas, actualizadas, total: filas.length };
}

export {
  UBICACIONES_CONSULTORIA,
  TIPOS_CLIENTE,
  PROCESOS_PROPUESTA,
  STATUS_PROPUESTA,
  STATUS_PROYECTO,
  TIPOS_PROYECTO,
  ROLES_PROYECTO,
  DEFAULT_PCT_IVA_CONSULTORIA,
};
