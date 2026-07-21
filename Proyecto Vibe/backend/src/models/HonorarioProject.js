import mongoose from 'mongoose';

const honorarioProjectSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    cliente: { type: String, trim: true, default: '' },
    activo: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

honorarioProjectSchema.index(
  { nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } }
);

export const HonorarioProject = mongoose.model('HonorarioProject', honorarioProjectSchema);
