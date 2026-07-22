import mongoose from 'mongoose';

const honorarioProjectSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    cliente: { type: String, trim: true, default: '' },
    /** IVA por defecto al capturar (0 = exento, ej. NOVAMEX USD). */
    pctIva: { type: Number, default: 0.16, min: 0, max: 1 },
    activo: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

honorarioProjectSchema.index(
  { nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } }
);

export const HonorarioProject = mongoose.model('HonorarioProject', honorarioProjectSchema);
