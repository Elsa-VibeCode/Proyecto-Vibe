import mongoose from 'mongoose';
import { ROLES_HONORARIO } from '../utils/honorariosMotor.js';

const roleAssignmentSchema = new mongoose.Schema(
  {
    consultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      required: true,
    },
    rol: { type: String, enum: ROLES_HONORARIO, required: true },
    pct: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: true }
);

const monthlyDistributionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HonorarioProject',
      required: true,
      index: true,
    },
    periodo: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    ingreso1aQna: { type: Number, default: 0, min: 0 },
    ingreso2daQna: { type: Number, default: 0, min: 0 },
    pctTech: { type: Number, default: 0.05, min: 0, max: 1 },
    pctLicencia: { type: Number, default: 0.2, min: 0, max: 1 },
    pctGrupo: { type: Number, default: 0.1, min: 0, max: 1 },
    /** IVA sobre el valor sin IVA (solo referencia de facturación). */
    pctIva: { type: Number, default: 0.16, min: 0, max: 1 },
    grupoConsultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      default: null,
    },
    asignaciones: [roleAssignmentSchema],
    observaciones: { type: String, trim: true, default: '' },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

monthlyDistributionSchema.index({ projectId: 1, periodo: 1 }, { unique: true });

export const MonthlyDistribution = mongoose.model(
  'MonthlyDistribution',
  monthlyDistributionSchema
);
