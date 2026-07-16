import mongoose from 'mongoose';

const errorImportSchema = new mongoose.Schema(
  {
    fila: { type: Number, required: true },
    mensaje: { type: String, required: true },
  },
  { _id: false }
);

const importacionLogSchema = new mongoose.Schema(
  {
    fuente: { type: String, enum: ['sicofi', 'excel'], default: 'sicofi' },
    usuario: { type: String, default: '' },
    nombreArchivo: { type: String, default: '' },
    archivoPath: { type: String, default: '' },
    totalFilas: { type: Number, default: 0 },
    creadas: { type: Number, default: 0 },
    actualizadas: { type: Number, default: 0 },
    ignoradas: { type: Number, default: 0 },
    errores: { type: [errorImportSchema], default: [] },
    mappingUsado: { type: mongoose.Schema.Types.Mixed, default: {} },
    estrategiaDuplicados: { type: String, default: 'ignorar' },
  },
  { timestamps: true }
);

export const ImportacionLog = mongoose.model('ImportacionLog', importacionLogSchema);
