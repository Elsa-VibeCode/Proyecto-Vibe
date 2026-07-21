import mongoose from 'mongoose';

const percentagePresetSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, unique: true },
    pctTech: { type: Number, required: true },
    pctLicencia: { type: Number, required: true },
    pctGrupo: { type: Number, required: true },
    pctFinder: { type: Number, required: true },
    pctCloser: { type: Number, required: true },
    pctEjecucion: { type: Number, required: true },
  },
  { timestamps: true }
);

export const PercentagePreset = mongoose.model('PercentagePreset', percentagePresetSchema);
