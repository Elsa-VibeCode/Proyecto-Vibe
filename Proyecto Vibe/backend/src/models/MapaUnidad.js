import mongoose from 'mongoose';
import { normalizarClave } from '../utils/clasificacionMotor.js';

const mapaUnidadSchema = new mongoose.Schema(
  {
    clienteRazonSocial: {
      type: String,
      required: true,
      trim: true,
    },
    clienteRazonSocialNormalizado: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true,
    },
    unidad: {
      type: String,
      enum: ['Consulting', 'Technologies', 'Grupo'],
      required: true,
    },
    estado: {
      type: String,
      enum: ['confirmado', 'por_confirmar'],
      default: 'por_confirmar',
    },
    notas: {
      type: String,
      default: '',
      trim: true,
    },
    actualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: 'actualizadoEn' },
  }
);

mapaUnidadSchema.pre('validate', function preValidate() {
  this.clienteRazonSocialNormalizado = normalizarClave(this.clienteRazonSocial);
});

export const MapaUnidad = mongoose.model('MapaUnidad', mapaUnidadSchema);
