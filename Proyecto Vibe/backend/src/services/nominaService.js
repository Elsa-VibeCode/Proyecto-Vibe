import { NominaPago } from '../models/NominaPago.js';
import { obtenerIndiceColaboradores } from '../services/colaboradorSync.js';
import { enriquecerPagoNomina, resumenClasificacionNomina, calcularResumenNominaMensual } from '../utils/nominaMotor.js';
import { parsearNominaRealDesdeExcelImport } from '../utils/nominaParser.js';

export async function sincronizarPagosDesdeImportacion(importacion, usuarioId) {
  const borrador = parsearNominaRealDesdeExcelImport(importacion);
  const indice = await obtenerIndiceColaboradores();
  let sincronizados = 0;
  let omitidos = 0;

  for (const pago of borrador) {
    const enriquecido = enriquecerPagoNomina(pago, indice);
    const claveOrigen = enriquecido.claveOrigen || `${importacion._id}|${pago.colaborador}|${pago.monto}|${pago.periodo}`;

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
          montoClasificadoBase: enriquecido.montoClasificadoBase,
          montoExcedente: enriquecido.montoExcedente,
          importacionId: importacion._id,
          claveOrigen,
          subidoPor: usuarioId,
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
  const pagos = await NominaPago.find({ subidoPor: usuarioId });
  const indice = await obtenerIndiceColaboradores();
  let actualizados = 0;

  for (const doc of pagos) {
    const enriquecido = enriquecerPagoNomina(doc.toObject(), indice);
    doc.colaboradorId = enriquecido.colaboradorId;
    doc.unidadClasificada = enriquecido.unidadClasificada;
    doc.estadoClasificacion = enriquecido.estadoClasificacion;
    doc.montoClasificadoBase = enriquecido.montoClasificadoBase;
    doc.montoExcedente = enriquecido.montoExcedente;
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
  if (filtros.soloRevision === 'true') {
    query.estadoClasificacion = { $in: ['excede_tope_revisar', 'no_encontrado'] };
  }

  const pagos = await NominaPago.find(query).sort({ fecha: -1, colaborador: 1 }).lean();
  const clasificacion = resumenClasificacionNomina(pagos);
  const resumenMensual = calcularResumenNominaMensual(pagos);

  return { pagos, clasificacion, resumenMensual, total: pagos.length };
}

export async function crearPagoManual(datos, usuarioId) {
  const indice = await obtenerIndiceColaboradores();
  const enriquecido = enriquecerPagoNomina(datos, indice);

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
    montoClasificadoBase: enriquecido.montoClasificadoBase,
    montoExcedente: enriquecido.montoExcedente,
    claveOrigen: datos.claveOrigen || `manual|${Date.now()}|${datos.colaborador}|${datos.monto}`,
    subidoPor: usuarioId,
  });
}
