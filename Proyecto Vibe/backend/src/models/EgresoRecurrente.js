import mongoose from 'mongoose';

const FRECUENCIAS = ['MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'ANUAL'];

const egresoRecurrenteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipoGasto: { type: String, required: true, trim: true },
    proveedorEsperado: { type: String, required: true, trim: true },
    unidad: { type: String, required: true, default: 'Grupo' },
    frecuencia: { type: String, enum: FRECUENCIAS, default: 'MENSUAL' },
    diaEsperado: { type: Number, min: 1, max: 31 },
    montoReferencia: { type: Number },
    tolerancia: { type: Number, default: 0.1 },
    activo: { type: Boolean, default: true },
    ultimaAlertaGenerada: { type: Date },
  },
  { timestamps: true }
);

export const EgresoRecurrente = mongoose.model('EgresoRecurrente', egresoRecurrenteSchema);
export { FRECUENCIAS };
