import mongoose from 'mongoose';
import {
  PROCESOS_PROPUESTA,
  STATUS_PROPUESTA,
  UBICACIONES_CONSULTORIA,
  DEFAULT_PCT_IVA_CONSULTORIA,
} from '../utils/consultoriaConstants.js';

/**
 * Pipeline comercial (Excel: "análisis propuestas").
 * monto = valor del proyecto sin IVA (nullable si aún no se cotiza).
 */
const consultoriaPropuestaSchema = new mongoose.Schema(
  {
    anio: { type: Number, required: true, min: 2020, max: 2100, index: true },
    mes: { type: Number, required: true, min: 1, max: 12, index: true },
    numeroConsecutivo: { type: Number, required: true, min: 1 },
    ubicacion: {
      type: String,
      enum: UBICACIONES_CONSULTORIA,
      required: true,
      index: true,
    },
    liderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      required: true,
      index: true,
    },
    /** Segundo líder cuando el Excel pone "Mario/Ulises". */
    liderSecundarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      default: null,
    },
    /** null = Finder N/A */
    finderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      default: null,
      index: true,
    },
    clienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsultoriaCliente',
      required: true,
      index: true,
    },
    tiempoEstimado: { type: String, trim: true, default: '' },
    proceso: {
      type: String,
      enum: PROCESOS_PROPUESTA,
      required: true,
      index: true,
    },
    procesoDetalle: { type: String, trim: true, default: '' },
    /** Sin IVA. null = pendiente de cotizar. */
    monto: { type: Number, default: null, min: 0 },
    pctIva: { type: Number, default: DEFAULT_PCT_IVA_CONSULTORIA, min: 0, max: 1 },
    status: {
      type: String,
      enum: STATUS_PROPUESTA,
      default: 'PROSPECTO',
      index: true,
    },
    fechaRegistro: { type: Date, default: Date.now },
    notas: { type: String, trim: true, default: '' },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

consultoriaPropuestaSchema.index(
  { anio: 1, mes: 1, numeroConsecutivo: 1 },
  { unique: true }
);

export const ConsultoriaPropuesta = mongoose.model(
  'ConsultoriaPropuesta',
  consultoriaPropuestaSchema
);
