import mongoose from 'mongoose';
import { normalizarClave } from '../utils/clasificacionMotor.js';

const reglaSueldoSchema = new mongoose.Schema(
  {
    vigenciaDesde: { type: Date, required: true },
    vigenciaHasta: { type: Date, default: null },
    tipo: {
      type: String,
      enum: ['sueldo_fijo', 'por_proyecto'],
      required: true,
    },
    montoTope: { type: Number, default: null },
    notas: { type: String, default: '', trim: true },
  },
  { _id: true }
);

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
      enum: ['socio', 'empleado', 'honorarios_externos'],
      required: true,
    },
    reglasSueldo: { type: [reglaSueldoSchema], default: [] },
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
