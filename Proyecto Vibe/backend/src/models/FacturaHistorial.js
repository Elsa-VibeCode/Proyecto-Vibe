import mongoose from 'mongoose';

const cambioSchema = new mongoose.Schema(
  {
    campo: { type: String, required: true },
    anterior: { type: mongoose.Schema.Types.Mixed },
    nuevo: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const facturaHistorialSchema = new mongoose.Schema(
  {
    facturaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Factura', index: true, required: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    accion: { type: String, enum: ['crear', 'actualizar', 'eliminar'], required: true },
    cambios: { type: [cambioSchema], default: [] },
  },
  { timestamps: true }
);

export const FacturaHistorial = mongoose.model('FacturaHistorial', facturaHistorialSchema);
