import { Factura, unidadEfectiva } from '../models/Factura.js';
import { Egreso } from '../models/Egreso.js';
import { ConsultoriaIngresoMensual } from '../models/ConsultoriaIngresoMensual.js';
import { ConsultoriaIngresoProyecto } from '../models/ConsultoriaIngresoProyecto.js';
import { ConsultoriaNominaMensual } from '../models/ConsultoriaNominaMensual.js';
import { ConsultoriaProyecto } from '../models/ConsultoriaProyecto.js';
import { ConsultoriaAuditLog } from '../models/ConsultoriaAuditLog.js';
import { FILTRO_ACTIVAS } from './facturaService.js';
import {
  redondearPesos,
  toCents,
  fromCents,
  cumplimiento,
  acumuladosHastaMes,
  gapNomina,
} from '../utils/consultoriaMotor.js';
import { DEFAULT_PCT_IVA_CONSULTORIA } from '../utils/consultoriaConstants.js';

function clerkMeta(usuario) {
  return {
    userId: usuario?.clerkUserId || usuario?._id || 'system',
    userEmail: usuario?.email || '',
  };
}

async function registrarAudit(payload) {
  await ConsultoriaAuditLog.create({
    userId: payload.userId || 'system',
    userEmail: payload.userEmail || '',
    entidad: payload.entidad,
    entidadId: String(payload.entidadId),
    accion: payload.accion,
    campo: payload.campo || '',
    valorAnterior: payload.valorAnterior ?? null,
    valorNuevo: payload.valorNuevo ?? null,
    justificacion: payload.justificacion || '',
  });
}

function validarAnioMes(anio, mes) {
  const a = Number(anio);
  const m = Number(mes);
  if (!Number.isInteger(a) || a < 2020) throw new Error('año inválido');
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('mes inválido');
  return { anio: a, mes: m };
}

function periodoKey(anio, mes) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

async function sumaDetalleMes(anio, mes) {
  const docs = await ConsultoriaIngresoProyecto.find({ anio, mes }).lean();
  let facturado = 0;
  let cobrado = 0;
  for (const d of docs) {
    facturado += toCents(d.montoFacturado);
    cobrado += toCents(d.montoCobrado);
  }
  return {
    cantidad: docs.length,
    sumaFacturado: fromCents(facturado),
    sumaCobrado: fromCents(cobrado),
  };
}

async function asegurarMesAbierto(anio, mes) {
  const doc = await ConsultoriaIngresoMensual.findOne({ anio, mes });
  if (doc?.cerrado) {
    throw new Error(
      `El mes ${periodoKey(anio, mes)} está cerrado. Reabre con justificación para editar.`
    );
  }
  return doc;
}

function enriquecerMensual(doc, sumaCobrado, filasAnio = []) {
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  const conciliacion = {
    sumaDetalle: sumaCobrado,
    ingresoReal: redondearPesos(plain.ingresoReal),
    cuadra: toCents(plain.ingresoReal) === toCents(sumaCobrado),
    diferencia: fromCents(toCents(plain.ingresoReal) - toCents(sumaCobrado)),
  };
  const acum = acumuladosHastaMes(
    filasAnio.map((f) => ({
      mes: f.mes,
      ingresoReal: f.ingresoReal,
      meta: f.meta,
    })),
    plain.mes
  );
  return {
    ...plain,
    cumplimientoMes: cumplimiento(plain.ingresoReal, plain.meta),
    ...acum,
    conciliacion,
    formula: {
      cumplimientoMes: 'ingreso_real / meta',
      ingresoAcumulado: 'SUM(ingreso_real) YTD',
      metaAcumulada: 'SUM(meta) YTD',
      conciliacion: 'ingreso_real − SUM(ingresos_por_proyecto.monto_cobrado)',
    },
  };
}

export async function listarIngresosMensuales({ anio } = {}) {
  const filtro = {};
  if (anio) filtro.anio = Number(anio);
  const docs = await ConsultoriaIngresoMensual.find(filtro).sort({ anio: 1, mes: 1 }).lean();
  const porAnio = new Map();
  for (const d of docs) {
    if (!porAnio.has(d.anio)) porAnio.set(d.anio, []);
    porAnio.get(d.anio).push(d);
  }

  const resultado = [];
  for (const d of docs) {
    const suma = await sumaDetalleMes(d.anio, d.mes);
    resultado.push(enriquecerMensual(d, suma.sumaCobrado, porAnio.get(d.anio) || []));
  }
  return resultado;
}

function popularDetalle(q) {
  return q
    .populate({
      path: 'proyectoId',
      select: 'descripcion status consultorId clienteId',
      populate: [
        { path: 'consultorId', select: 'nombre' },
        { path: 'clienteId', select: 'nombre' },
      ],
    })
    .populate('facturaId', 'noFactura cliente subtotal total estatusPago mes unidad');
}

export async function listarDetalleIngresos({ anio, mes, proyectoId } = {}) {
  const filtro = {};
  if (anio) filtro.anio = Number(anio);
  if (mes) filtro.mes = Number(mes);
  if (proyectoId) filtro.proyectoId = proyectoId;
  return popularDetalle(ConsultoriaIngresoProyecto.find(filtro).sort({ anio: -1, mes: -1 })).lean();
}

export async function resumenFacturasConsultoria(anio, mes) {
  const { anio: a, mes: m } = validarAnioMes(anio, mes);
  const periodo = periodoKey(a, m);
  const facturas = await Factura.find({ ...FILTRO_ACTIVAS, mes: periodo })
    .select('noFactura cliente subtotal iva total estatusPago fechaPago unidad')
    .lean();

  const consulting = facturas.filter((f) => unidadEfectiva(f.unidad) === 'Consulting');
  let subtotal = 0;
  let cobrado = 0;
  for (const f of consulting) {
    subtotal += toCents(f.subtotal);
    if (['PAGADO', 'PARCIAL'].includes(f.estatusPago)) {
      cobrado += toCents(f.subtotal);
    }
  }
  return {
    periodo,
    cantidad: consulting.length,
    subtotalSinIva: fromCents(subtotal),
    cobradoAproxSinIva: fromCents(cobrado),
    formula: {
      subtotal: 'SUM(Factura.subtotal) unidad=Consulting mes',
      cobrado: 'SUM(subtotal) donde estatusPago in PAGADO|PARCIAL',
    },
    facturas: consulting.slice(0, 100),
  };
}

export async function resumenEgresosConsultoria(anio, mes) {
  const { anio: a, mes: m } = validarAnioMes(anio, mes);
  const periodo = periodoKey(a, m);
  const egresos = await Egreso.find({ mes: periodo, unidad: 'Consulting' })
    .select('fechaGasto proveedor subtotal total tipoGasto')
    .lean();

  let subtotal = 0;
  let total = 0;
  for (const e of egresos) {
    subtotal += toCents(e.subtotal);
    total += toCents(e.total);
  }
  return {
    periodo,
    cantidad: egresos.length,
    subtotal: fromCents(subtotal),
    total: fromCents(total),
    origen: 'Módulo Egresos AdminSys (unidad Consulting)',
    enlace: '/egresos',
    formula: { total: 'SUM(Egreso.total) unidad=Consulting mes' },
  };
}

export async function obtenerIngresoMensual(anio, mes) {
  const { anio: a, mes: m } = validarAnioMes(anio, mes);
  let doc = await ConsultoriaIngresoMensual.findOne({ anio: a, mes: m });
  if (!doc) {
    doc = await ConsultoriaIngresoMensual.create({
      anio: a,
      mes: m,
      facturacion: 0,
      ingresoReal: 0,
      meta: 0,
    });
  }
  const suma = await sumaDetalleMes(a, m);
  const anioDocs = await ConsultoriaIngresoMensual.find({ anio: a }).sort({ mes: 1 }).lean();
  const detalle = await listarDetalleIngresos({ anio: a, mes: m });
  const nomina = await ConsultoriaNominaMensual.findOne({ anio: a, mes: m }).lean();
  const egresos = await resumenEgresosConsultoria(a, m);
  const facturas = await resumenFacturasConsultoria(a, m);

  return {
    mensual: enriquecerMensual(doc, suma.sumaCobrado, anioDocs),
    detalle,
    nomina: nomina
      ? {
          ...nomina,
          gap: gapNomina(nomina.ingresosFijos, nomina.montoNomina),
          formula: { gap: 'ingresos_fijos − nómina' },
        }
      : null,
    egresos,
    facturasConciliacion: facturas,
  };
}

export async function upsertIngresoMensual(datos, usuario) {
  const { anio, mes } = validarAnioMes(datos.anio, datos.mes);
  await asegurarMesAbierto(anio, mes);

  const existente = await ConsultoriaIngresoMensual.findOne({ anio, mes });
  const facturacion =
    datos.facturacion !== undefined
      ? redondearPesos(Number(datos.facturacion) || 0)
      : existente?.facturacion ?? 0;
  const meta =
    datos.meta !== undefined
      ? redondearPesos(Number(datos.meta) || 0)
      : existente?.meta ?? 0;
  let ingresoReal =
    datos.ingresoReal !== undefined
      ? redondearPesos(Number(datos.ingresoReal) || 0)
      : existente?.ingresoReal ?? 0;

  const suma = await sumaDetalleMes(anio, mes);
  const forzar = Boolean(datos.forzarDescuadre);
  const justificacion = String(datos.justificacion || '').trim();

  if (datos.sincronizarDesdeDetalle) {
    ingresoReal = suma.sumaCobrado;
  }

  const conciliacion = {
    sumaDetalle: suma.sumaCobrado,
    ingresoReal,
    cuadra: toCents(ingresoReal) === toCents(suma.sumaCobrado),
    diferencia: fromCents(toCents(ingresoReal) - toCents(suma.sumaCobrado)),
  };

  if (!conciliacion.cuadra && suma.cantidad > 0 && !forzar && !datos.sincronizarDesdeDetalle) {
    const err = new Error(
      `Descuadre: ingreso_real (${ingresoReal}) ≠ SUM(detalle cobrado) (${suma.sumaCobrado}). ` +
        `Diferencia ${conciliacion.diferencia}. Usa sincronizarDesdeDetalle o forzarDescuadre + justificación.`
    );
    err.code = 'DESCUADRE';
    err.conciliacion = conciliacion;
    throw err;
  }
  if (!conciliacion.cuadra && forzar && !justificacion) {
    throw new Error('Justificación obligatoria para forzar descuadre');
  }

  const metaClerk = clerkMeta(usuario);
  const doc = await ConsultoriaIngresoMensual.findOneAndUpdate(
    { anio, mes },
    {
      $set: {
        facturacion,
        ingresoReal,
        meta,
        notas:
          datos.notas !== undefined
            ? String(datos.notas || '').trim()
            : existente?.notas || '',
        esHistoricoAnual: Boolean(datos.esHistoricoAnual ?? existente?.esHistoricoAnual),
        updatedBy: metaClerk.userId,
      },
      $setOnInsert: { createdBy: metaClerk.userId, cerrado: false },
    },
    { upsert: true, new: true, runValidators: true }
  );

  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoMensual',
    entidadId: doc._id,
    accion: forzar && !conciliacion.cuadra ? 'OVERRIDE' : 'UPDATE',
    valorNuevo: { facturacion, ingresoReal, meta, conciliacion },
    justificacion,
  });

  const anioDocs = await ConsultoriaIngresoMensual.find({ anio }).sort({ mes: 1 }).lean();
  return enriquecerMensual(doc, suma.sumaCobrado, anioDocs);
}

export async function sincronizarMesDesdeDetalle(anio, mes, usuario) {
  const { anio: a, mes: m } = validarAnioMes(anio, mes);
  await asegurarMesAbierto(a, m);
  const suma = await sumaDetalleMes(a, m);
  const metaClerk = clerkMeta(usuario);
  const doc = await ConsultoriaIngresoMensual.findOneAndUpdate(
    { anio: a, mes: m },
    {
      $set: {
        ingresoReal: suma.sumaCobrado,
        facturacion: suma.sumaFacturado,
        updatedBy: metaClerk.userId,
      },
      $setOnInsert: {
        meta: 0,
        createdBy: metaClerk.userId,
        cerrado: false,
      },
    },
    { upsert: true, new: true }
  );
  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoMensual',
    entidadId: doc._id,
    accion: 'UPDATE',
    campo: 'sincronizarDesdeDetalle',
    valorNuevo: { ingresoReal: doc.ingresoReal, facturacion: doc.facturacion },
  });
  const anioDocs = await ConsultoriaIngresoMensual.find({ anio: a }).sort({ mes: 1 }).lean();
  return enriquecerMensual(doc, suma.sumaCobrado, anioDocs);
}

export async function cerrarMes(anio, mes, usuario) {
  const { anio: a, mes: m } = validarAnioMes(anio, mes);
  const doc = await ConsultoriaIngresoMensual.findOne({ anio: a, mes: m });
  if (!doc) throw new Error('No hay registro de ingresos para ese mes');
  if (doc.cerrado) throw new Error('El mes ya está cerrado');

  const suma = await sumaDetalleMes(a, m);
  if (suma.cantidad > 0 && toCents(doc.ingresoReal) !== toCents(suma.sumaCobrado)) {
    throw new Error(
      `No se puede cerrar: descuadre ingreso_real (${doc.ingresoReal}) vs detalle (${suma.sumaCobrado})`
    );
  }

  const metaClerk = clerkMeta(usuario);
  doc.cerrado = true;
  doc.snapshot = {
    facturacion: doc.facturacion,
    ingresoReal: doc.ingresoReal,
    meta: doc.meta,
    sumaDetalleCobrado: suma.sumaCobrado,
    cerradoEn: new Date(),
    cerradoPor: metaClerk.userId,
  };
  doc.updatedBy = metaClerk.userId;
  await doc.save();

  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoMensual',
    entidadId: doc._id,
    accion: 'CERRAR_MES',
    valorNuevo: doc.snapshot,
  });

  return enriquecerMensual(doc, suma.sumaCobrado, [
    { mes: m, ingresoReal: doc.ingresoReal, meta: doc.meta },
  ]);
}

export async function reabrirMes(anio, mes, justificacion, usuario) {
  const { anio: a, mes: m } = validarAnioMes(anio, mes);
  const just = String(justificacion || '').trim();
  if (!just) throw new Error('Justificación obligatoria para reabrir mes');

  const doc = await ConsultoriaIngresoMensual.findOne({ anio: a, mes: m });
  if (!doc) throw new Error('No hay registro de ingresos para ese mes');
  if (!doc.cerrado) throw new Error('El mes no está cerrado');

  const metaClerk = clerkMeta(usuario);
  const antes = doc.snapshot;
  doc.cerrado = false;
  doc.updatedBy = metaClerk.userId;
  await doc.save();

  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoMensual',
    entidadId: doc._id,
    accion: 'REABRIR_MES',
    valorAnterior: antes,
    justificacion: just,
  });

  const suma = await sumaDetalleMes(a, m);
  return enriquecerMensual(doc, suma.sumaCobrado, [
    { mes: m, ingresoReal: doc.ingresoReal, meta: doc.meta },
  ]);
}

export async function crearDetalleIngreso(datos, usuario) {
  const { anio, mes } = validarAnioMes(datos.anio, datos.mes);
  await asegurarMesAbierto(anio, mes);
  if (!datos.proyectoId) throw new Error('proyectoId es obligatorio');
  const proyecto = await ConsultoriaProyecto.findById(datos.proyectoId);
  if (!proyecto) throw new Error('Proyecto no encontrado');

  const metaClerk = clerkMeta(usuario);
  const doc = await ConsultoriaIngresoProyecto.create({
    proyectoId: datos.proyectoId,
    anio,
    mes,
    montoFacturado: redondearPesos(Number(datos.montoFacturado) || 0),
    montoCobrado: redondearPesos(Number(datos.montoCobrado) || 0),
    pctIva: datos.pctIva !== undefined ? Number(datos.pctIva) : DEFAULT_PCT_IVA_CONSULTORIA,
    fechaFactura: datos.fechaFactura ? new Date(datos.fechaFactura) : null,
    folio: String(datos.folio || '').trim(),
    facturaId: datos.facturaId || null,
    notas: String(datos.notas || '').trim(),
    createdBy: metaClerk.userId,
    updatedBy: metaClerk.userId,
  });

  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoProyecto',
    entidadId: doc._id,
    accion: 'CREATE',
    valorNuevo: {
      anio,
      mes,
      montoCobrado: doc.montoCobrado,
      montoFacturado: doc.montoFacturado,
    },
  });

  return popularDetalle(ConsultoriaIngresoProyecto.findById(doc._id)).lean();
}

export async function actualizarDetalleIngreso(id, datos, usuario) {
  const doc = await ConsultoriaIngresoProyecto.findById(id);
  if (!doc) return null;
  await asegurarMesAbierto(doc.anio, doc.mes);

  const antes = { montoCobrado: doc.montoCobrado, montoFacturado: doc.montoFacturado };
  if (datos.montoFacturado !== undefined) {
    doc.montoFacturado = redondearPesos(Number(datos.montoFacturado) || 0);
  }
  if (datos.montoCobrado !== undefined) {
    doc.montoCobrado = redondearPesos(Number(datos.montoCobrado) || 0);
  }
  if (datos.pctIva !== undefined) doc.pctIva = Number(datos.pctIva);
  if (datos.fechaFactura !== undefined) {
    doc.fechaFactura = datos.fechaFactura ? new Date(datos.fechaFactura) : null;
  }
  if (datos.folio !== undefined) doc.folio = String(datos.folio).trim();
  if (datos.facturaId !== undefined) doc.facturaId = datos.facturaId || null;
  if (datos.notas !== undefined) doc.notas = String(datos.notas).trim();
  if (datos.proyectoId) doc.proyectoId = datos.proyectoId;

  const metaClerk = clerkMeta(usuario);
  doc.updatedBy = metaClerk.userId;
  await doc.save();

  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoProyecto',
    entidadId: doc._id,
    accion: 'UPDATE',
    valorAnterior: antes,
    valorNuevo: { montoCobrado: doc.montoCobrado, montoFacturado: doc.montoFacturado },
  });

  return popularDetalle(ConsultoriaIngresoProyecto.findById(doc._id)).lean();
}

export async function eliminarDetalleIngreso(id, usuario) {
  const doc = await ConsultoriaIngresoProyecto.findById(id);
  if (!doc) return null;
  await asegurarMesAbierto(doc.anio, doc.mes);
  await doc.deleteOne();
  const metaClerk = clerkMeta(usuario);
  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaIngresoProyecto',
    entidadId: id,
    accion: 'DELETE',
    valorAnterior: { anio: doc.anio, mes: doc.mes, montoCobrado: doc.montoCobrado },
  });
  return { _id: id, eliminado: true };
}

export async function upsertNominaMensual(datos, usuario) {
  const { anio, mes } = validarAnioMes(datos.anio, datos.mes);
  const montoNomina = redondearPesos(Number(datos.montoNomina) || 0);
  const ingresosFijos = redondearPesos(Number(datos.ingresosFijos) || 0);
  const metaClerk = clerkMeta(usuario);

  const doc = await ConsultoriaNominaMensual.findOneAndUpdate(
    { anio, mes },
    {
      $set: {
        montoNomina,
        ingresosFijos,
        notas: String(datos.notas || '').trim(),
        updatedBy: metaClerk.userId,
      },
      $setOnInsert: { createdBy: metaClerk.userId },
    },
    { upsert: true, new: true }
  );

  await registrarAudit({
    ...metaClerk,
    entidad: 'ConsultoriaNominaMensual',
    entidadId: doc._id,
    accion: 'UPDATE',
    valorNuevo: { montoNomina, ingresosFijos, gap: gapNomina(ingresosFijos, montoNomina) },
  });

  return {
    ...doc.toObject(),
    gap: gapNomina(ingresosFijos, montoNomina),
    formula: { gap: 'ingresos_fijos − nómina' },
  };
}

export async function seedHistoricoIngresos(usuario) {
  const historicos = [
    { anio: 2021, ingresoReal: 4166550.98 },
    { anio: 2022, ingresoReal: 6194170.78 },
    { anio: 2023, ingresoReal: 4428753.89 },
  ];
  const metaClerk = clerkMeta(usuario);
  let upserts = 0;
  for (const h of historicos) {
    await ConsultoriaIngresoMensual.findOneAndUpdate(
      { anio: h.anio, mes: 12 },
      {
        $set: {
          facturacion: h.ingresoReal,
          ingresoReal: h.ingresoReal,
          meta: h.ingresoReal,
          esHistoricoAnual: true,
          cerrado: true,
          snapshot: {
            facturacion: h.ingresoReal,
            ingresoReal: h.ingresoReal,
            meta: h.ingresoReal,
            sumaDetalleCobrado: h.ingresoReal,
            cerradoEn: new Date(),
            cerradoPor: metaClerk.userId,
          },
          notas: 'Histórico anual importado (Excel BWS)',
          updatedBy: metaClerk.userId,
        },
        $setOnInsert: { createdBy: metaClerk.userId },
      },
      { upsert: true }
    );
    upserts += 1;
  }
  return { upserts, historicos };
}

export async function comparativoAnual(anioActual) {
  const anio = Number(anioActual) || new Date().getFullYear();
  const anios = [anio, anio - 1, anio - 2, anio - 3, anio - 4].filter((a) => a >= 2021);
  const docs = await ConsultoriaIngresoMensual.find({ anio: { $in: anios } })
    .sort({ anio: 1, mes: 1 })
    .lean();

  const porAnio = {};
  for (const a of anios) {
    porAnio[a] = { anio: a, porMes: Array(12).fill(0), total: 0, esHistorico: false };
  }
  for (const d of docs) {
    if (!porAnio[d.anio]) continue;
    if (d.esHistoricoAnual) {
      porAnio[d.anio].total = d.ingresoReal;
      porAnio[d.anio].esHistorico = true;
    } else {
      porAnio[d.anio].porMes[d.mes - 1] = d.ingresoReal;
      porAnio[d.anio].total = fromCents(
        toCents(porAnio[d.anio].total) + toCents(d.ingresoReal)
      );
    }
  }
  return {
    anios,
    series: Object.values(porAnio),
    formula: { total: 'SUM(ingreso_real) del año (o snapshot histórico anual)' },
  };
}
