import mongoose from 'mongoose';

/**
 * Nómina vs ingresos fijos (gap) del Excel BWS.
 * Opcional: puede coexistir con el módulo /nomina de AdminSys;
 * aquí es el indicador operativo de Consultoría.
 */
const consultoriaNominaMensualSchema = new mongoose.Schema(
  {
    anio: { type: Number, required: true, min: 2020, max: 2100, index: true },
    mes: { type: Number, required: true, min: 1, max: 12, index: true },
    montoNomina: { type: Number, default: 0, min: 0 },
    ingresosFijos: { type: Number, default: 0, min: 0 },
    notas: { type: String, trim: true, default: '' },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

consultoriaNominaMensualSchema.index({ anio: 1, mes: 1 }, { unique: true });

export const ConsultoriaNominaMensual = mongoose.model(
  'ConsultoriaNominaMensual',
  consultoriaNominaMensualSchema
);
