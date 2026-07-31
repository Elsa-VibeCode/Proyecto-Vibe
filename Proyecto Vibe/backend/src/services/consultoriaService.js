import { Consultant } from '../models/Consultant.js';
import { ConsultoriaCliente } from '../models/ConsultoriaCliente.js';
import { ConsultoriaPropuesta } from '../models/ConsultoriaPropuesta.js';
import { ConsultoriaAuditLog } from '../models/ConsultoriaAuditLog.js';
import {
  PROCESOS_PROPUESTA,
  STATUS_PROPUESTA,
  TIPOS_CLIENTE,
  UBICACIONES_CONSULTORIA,
  DEFAULT_PCT_IVA_CONSULTORIA,
} from '../utils/consultoriaConstants.js';
import { redondearPesos, toCents, fromCents } from '../utils/consultoriaMotor.js';

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

export {
  UBICACIONES_CONSULTORIA,
  TIPOS_CLIENTE,
  PROCESOS_PROPUESTA,
  STATUS_PROPUESTA,
  DEFAULT_PCT_IVA_CONSULTORIA,
};
