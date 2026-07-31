import mongoose from 'mongoose';
import {
  ROLES_PROYECTO,
  STATUS_PROYECTO,
  TIPOS_PROYECTO,
  DEFAULT_PCT_IVA_CONSULTORIA,
} from '../utils/consultoriaConstants.js';

/**
 * Operación de proyectos (Excel: "OPERACIÓN").
 * COMPARTIDO: pctConsultorPrincipal + pctConsultorCompartido deben sumar 1.
 */
const consultoriaProyectoSchema = new mongoose.Schema(
  {
    consultorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      required: true,
      index: true,
    },
    rol: {
      type: String,
      enum: ROLES_PROYECTO,
      default: 'LIDER',
      index: true,
    },
    consultorCompartidoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      default: null,
    },
    /** Fracción del ingreso del responsable principal (0–1). Default 1 si LIDER. */
    pctConsultorPrincipal: { type: Number, default: 1, min: 0, max: 1 },
    /** Fracción del compartido. Default 0 si LIDER; configurable si COMPARTIDO. */
    pctConsultorCompartido: { type: Number, default: 0, min: 0, max: 1 },
    clienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsultoriaCliente',
      required: true,
      index: true,
    },
    descripcion: { type: String, required: true, trim: true },
    tipo: {
      type: String,
      enum: TIPOS_PROYECTO,
      default: 'CONSULTORIA',
      index: true,
    },
    status: {
      type: String,
      enum: STATUS_PROYECTO,
      default: 'INICIANDO',
      index: true,
    },
    propuestaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsultoriaPropuesta',
      default: null,
    },
    fechaInicio: { type: Date, default: null },
    fechaFinEstimada: { type: Date, default: null },
    fechaFinReal: { type: Date, default: null },
    /** Contrato sin IVA. */
    montoContratado: { type: Number, default: 0, min: 0 },
    pctIva: { type: Number, default: DEFAULT_PCT_IVA_CONSULTORIA, min: 0, max: 1 },
    notas: { type: String, trim: true, default: '' },
    activo: { type: Boolean, default: true, index: true },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

consultoriaProyectoSchema.index({ consultorId: 1, status: 1 });
consultoriaProyectoSchema.index({ clienteId: 1, status: 1 });

export const ConsultoriaProyecto = mongoose.model(
  'ConsultoriaProyecto',
  consultoriaProyectoSchema
);
