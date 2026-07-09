import mongoose from 'mongoose';

const nominaPagoSchema = new mongoose.Schema(
  {
    colaboradorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Colaborador',
      default: null,
      index: true,
    },
    colaborador: { type: String, required: true, trim: true },
    monto: { type: Number, required: true },
    fecha: { type: Date, required: true },
    periodo: { type: String, required: true, trim: true, index: true },
    concepto: { type: String, default: '', trim: true },
    responsableTransferencia: { type: String, default: '', trim: true },
    unidadClasificada: {
      type: String,
      enum: ['Consulting', 'Technologies', 'Grupo', 'sin_clasificar'],
      required: true,
    },
    estadoClasificacion: {
      type: String,
      enum: ['auto_confirmado', 'excede_tope_revisar', 'no_encontrado'],
      required: true,
    },
    montoClasificadoBase: { type: Number, default: 0 },
    montoExcedente: { type: Number, default: 0 },
    importacionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExcelImport',
      default: null,
    },
    claveOrigen: { type: String, default: '', trim: true, index: true },
    subidoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  }
);

nominaPagoSchema.index({ claveOrigen: 1, subidoPor: 1 }, { unique: true, sparse: true });

export const NominaPago = mongoose.model('NominaPago', nominaPagoSchema);
