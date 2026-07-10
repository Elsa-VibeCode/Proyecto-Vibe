import mongoose from 'mongoose';

const configuracionFlujoSchema = new mongoose.Schema(
  {
    clave: {
      type: String,
      default: 'global',
      unique: true,
      immutable: true,
    },
    saldoAperturaConsulting: { type: Number, default: 0 },
    saldoAperturaTechnologies: { type: Number, default: 0 },
    saldoAperturaGrupo: { type: Number, default: 0 },
    porcentajeAporteOficial: { type: Number, default: 10 },
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

export const ConfiguracionFlujo = mongoose.model('ConfiguracionFlujo', configuracionFlujoSchema);
