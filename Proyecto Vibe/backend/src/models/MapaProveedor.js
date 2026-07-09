import mongoose from 'mongoose';
import { normalizarClave } from '../utils/clasificacionMotor.js';

const mapaProveedorSchema = new mongoose.Schema(
  {
    rfcEmisor: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    razonSocial: {
      type: String,
      required: true,
      trim: true,
    },
    razonSocialNormalizado: {
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

mapaProveedorSchema.pre('validate', function preValidate() {
  this.razonSocialNormalizado = normalizarClave(this.razonSocial);
  if (this.rfcEmisor) this.rfcEmisor = this.rfcEmisor.trim().toUpperCase();
});

export const MapaProveedor = mongoose.model('MapaProveedor', mapaProveedorSchema);
