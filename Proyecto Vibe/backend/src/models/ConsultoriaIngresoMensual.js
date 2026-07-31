import mongoose from 'mongoose';

/**
 * Totales mensuales (Excel: "GRÁFICA INGRESOS").
 * ingresoReal debe = SUM(ConsultoriaIngresoProyecto.montoCobrado) del mes,
 * salvo forzarDescuadre + notaJustificacion (queda en audit_log).
 * Cierre manual: cerrado=true congela valores en snapshot.
 */
const snapshotSchema = new mongoose.Schema(
  {
    facturacion: Number,
    ingresoReal: Number,
    meta: Number,
    sumaDetalleCobrado: Number,
    cerradoEn: Date,
    cerradoPor: String,
  },
  { _id: false }
);

const consultoriaIngresoMensualSchema = new mongoose.Schema(
  {
    anio: { type: Number, required: true, min: 2020, max: 2100, index: true },
    mes: { type: Number, required: true, min: 1, max: 12, index: true },
    /** Sin IVA. */
    facturacion: { type: Number, default: 0, min: 0 },
    ingresoReal: { type: Number, default: 0, min: 0 },
    meta: { type: Number, default: 0, min: 0 },
    cerrado: { type: Boolean, default: false, index: true },
    snapshot: { type: snapshotSchema, default: null },
    /** Histórico anual importado (2021–2024) sin detalle por proyecto. */
    esHistoricoAnual: { type: Boolean, default: false },
    notas: { type: String, trim: true, default: '' },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

consultoriaIngresoMensualSchema.index({ anio: 1, mes: 1 }, { unique: true });

export const ConsultoriaIngresoMensual = mongoose.model(
  'ConsultoriaIngresoMensual',
  consultoriaIngresoMensualSchema
);
