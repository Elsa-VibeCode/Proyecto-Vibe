import mongoose from 'mongoose';
import { normalizarClave } from '../utils/clasificacionMotor.js';

const colaboradorSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    nombreNormalizado: { type: String, required: true, trim: true, unique: true, index: true },
    unidadBase: {
      type: String,
      enum: ['Consulting', 'Technologies', 'Grupo'],
      required: true,
    },
    tipoRelacion: {
      type: String,
      enum: ['socio', 'colaborador', 'honorarios_externos'],
      required: true,
    },
    tipoNomina: {
      type: String,
      enum: ['honorarios_por_proyecto', 'sueldo_y_comisiones', 'honorarios_externos'],
      required: true,
    },
    notas: { type: String, default: '', trim: true },
    actualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  }
);

colaboradorSchema.pre('validate', function preValidate() {
  this.nombreNormalizado = normalizarClave(this.nombre);
});

export const Colaborador = mongoose.model('Colaborador', colaboradorSchema);
