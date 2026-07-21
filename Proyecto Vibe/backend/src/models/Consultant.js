import mongoose from 'mongoose';

const consultantSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

consultantSchema.index(
  { nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } }
);

export const Consultant = mongoose.model('Consultant', consultantSchema);
