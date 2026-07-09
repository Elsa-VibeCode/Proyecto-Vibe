import { NominaPago } from '../models/NominaPago.js';
import { obtenerIndiceColaboradores } from '../services/colaboradorSync.js';
import {
  enriquecerPagoNomina,
  resumenClasificacionNomina,
  calcularResumenNominaMensual,
} from '../utils/nominaMotor.js';
import { parsearNominaRealDesdeExcelImport } from '../utils/nominaParser.js';

const UNIDADES_VALIDAS = new Set(['Consulting', 'Technologies', 'Grupo']);

function aplicarUnidadManual(enriquecido, datos) {
  if (datos.unidadClasificada && UNIDADES_VALIDAS.has(datos.unidadClasificada)) {
    return {
      ...enriquecido,
      unidadClasificada: datos.unidadClasificada,
      estadoClasificacion: 'manual',
      unidadManual: true,
      montoClasificadoBase: Number(datos.monto),
    };
  }
  return enriquecido;
}

export async function sincronizarPagosDesdeImportacion(importacion, usuarioId) {
  const borrador = parsearNominaRealDesdeExcelImport(importacion);
  const indice = await obtenerIndiceColaboradores();
  let sincronizados = 0;
  let omitidos = 0;

  for (const pago of borrador) {
    const existente = await NominaPago.findOne({
      claveOrigen: pago.claveOrigen,
      subidoPor: usuarioId,
    });

    if (existente?.unidadManual) {
      omitidos += 1;
      continue;
    }

    const enriquecido = enriquecerPagoNomina(pago, indice);
    const claveOrigen =
      enriquecido.claveOrigen || `${importacion._id}|${pago.colaborador}|${pago.monto}|${pago.periodo}`;

    try {
      await NominaPago.findOneAndUpdate(
        { claveOrigen, subidoPor: usuarioId },
        {
          colaboradorId: enriquecido.colaboradorId,
          colaborador: pago.colaborador,
          monto: pago.monto,
          fecha: pago.fecha,
          periodo: pago.periodo,
          concepto: pago.concepto,
          responsableTransferencia: pago.responsableTransferencia ?? '',
          unidadClasificada: enriquecido.unidadClasificada,
          estadoClasificacion: enriquecido.estadoClasificacion,
          unidadManual: false,
          montoClasificadoBase: enriquecido.montoClasificadoBase,
          importacionId: importacion._id,
          claveOrigen,
          subidoPor: usuarioId,
          $unset: { montoExcedente: '' },
        },
        { upsert: true, new: true, runValidators: true }
      );
      sincronizados += 1;
    } catch {
      omitidos += 1;
    }
  }

  return { sincronizados, omitidos, totalDetectados: borrador.length };
}

export async function reclasificarTodosLosPagos(usuarioId) {
  const pagos = await NominaPago.find({ subidoPor: usuarioId, unidadManual: { $ne: true } });
  const indice = await obtenerIndiceColaboradores();
  let actualizados = 0;

  for (const doc of pagos) {
    const enriquecido = enriquecerPagoNomina(doc.toObject(), indice);
    doc.colaboradorId = enriquecido.colaboradorId;
    doc.unidadClasificada = enriquecido.unidadClasificada;
    doc.estadoClasificacion = enriquecido.estadoClasificacion;
    doc.montoClasificadoBase = enriquecido.montoClasificadoBase;
    doc.unidadManual = false;
    await doc.save();
    actualizados += 1;
  }

  return { actualizados };
}

export async function obtenerResumenNomina(usuarioId, filtros = {}) {
  const query = { subidoPor: usuarioId };

  if (filtros.estadoClasificacion) query.estadoClasificacion = filtros.estadoClasificacion;
  if (filtros.unidadClasificada) query.unidadClasificada = filtros.unidadClasificada;
  if (filtros.periodo) query.periodo = filtros.periodo;
  if (filtros.soloSinClasificar === 'true') {
    query.estadoClasificacion = 'no_encontrado';
  }

  const pagos = await NominaPago.find(query).sort({ fecha: -1, colaborador: 1 }).lean();
  const clasificacion = resumenClasificacionNomina(pagos);
  const resumenMensual = calcularResumenNominaMensual(pagos);

  return { pagos, clasificacion, resumenMensual, total: pagos.length };
}

export async function crearPagoManual(datos, usuarioId) {
  const indice = await obtenerIndiceColaboradores();
  let enriquecido = enriquecerPagoNomina(datos, indice);
  enriquecido = aplicarUnidadManual(enriquecido, datos);

  return NominaPago.create({
    colaboradorId: enriquecido.colaboradorId,
    colaborador: datos.colaborador,
    monto: datos.monto,
    fecha: datos.fecha,
    periodo: datos.periodo,
    concepto: datos.concepto ?? '',
    responsableTransferencia: datos.responsableTransferencia ?? '',
    unidadClasificada: enriquecido.unidadClasificada,
    estadoClasificacion: enriquecido.estadoClasificacion,
    unidadManual: enriquecido.unidadManual ?? false,
    montoClasificadoBase: enriquecido.montoClasificadoBase,
    claveOrigen: datos.claveOrigen || `manual|${Date.now()}|${datos.colaborador}|${datos.monto}`,
    subidoPor: usuarioId,
    editadoPor: enriquecido.unidadManual ? usuarioId : null,
  });
}

export async function actualizarPagoNomina(id, datos, usuarioId) {
  const pago = await NominaPago.findOne({ _id: id, subidoPor: usuarioId });
  if (!pago) return null;

  if (datos.colaborador !== undefined) pago.colaborador = datos.colaborador;
  if (datos.monto !== undefined) pago.monto = datos.monto;
  if (datos.fecha !== undefined) pago.fecha = new Date(datos.fecha);
  if (datos.periodo !== undefined) pago.periodo = datos.periodo;
  if (datos.concepto !== undefined) pago.concepto = datos.concepto;
  if (datos.responsableTransferencia !== undefined) {
    pago.responsableTransferencia = datos.responsableTransferencia;
  }

  if (datos.unidadClasificada && UNIDADES_VALIDAS.has(datos.unidadClasificada)) {
    pago.unidadClasificada = datos.unidadClasificada;
    pago.estadoClasificacion = 'manual';
    pago.unidadManual = true;
    pago.montoClasificadoBase = pago.monto;
    pago.editadoPor = usuarioId;
  } else if (datos.reclasificar === true) {
    const indice = await obtenerIndiceColaboradores();
    const enriquecido = enriquecerPagoNomina(pago.toObject(), indice);
    pago.colaboradorId = enriquecido.colaboradorId;
    pago.unidadClasificada = enriquecido.unidadClasificada;
    pago.estadoClasificacion = enriquecido.estadoClasificacion;
    pago.montoClasificadoBase = enriquecido.montoClasificadoBase;
    pago.unidadManual = false;
    pago.editadoPor = null;
  }

  await pago.save();
  return pago;
}
