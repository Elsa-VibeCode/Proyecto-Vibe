import mongoose from 'mongoose';

const excelImportSchema = new mongoose.Schema(
  {
    nombreArchivo: {
      type: String,
      required: true,
      trim: true,
    },
    nombreHoja: {
      type: String,
      default: 'Hoja1',
    },
    columnas: {
      type: [String],
      default: [],
    },
    filas: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    totalFilas: {
      type: Number,
      default: 0,
    },
    tipoHoja: {
      type: String,
      default: 'generico',
    },
    datosEstructurados: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    subidoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ExcelImport = mongoose.model('ExcelImport', excelImportSchema);
