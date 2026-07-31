import mongoose from 'mongoose';
import { DEFAULT_PCT_IVA_CONSULTORIA } from '../utils/consultoriaConstants.js';

/**
 * Detalle auditable de facturación/cobro por proyecto y mes.
 * La suma de montoCobrado del mes debe cuadrar con
 * ConsultoriaIngresoMensual.ingresoReal (salvo override explícito).
 * Montos sin IVA.
 */
const consultoriaIngresoProyectoSchema = new mongoose.Schema(
  {
    proyectoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsultoriaProyecto',
      required: true,
      index: true,
    },
    anio: { type: Number, required: true, min: 2020, max: 2100, index: true },
    mes: { type: Number, required: true, min: 1, max: 12, index: true },
    montoFacturado: { type: Number, default: 0, min: 0 },
    montoCobrado: { type: Number, default: 0, min: 0 },
    pctIva: { type: Number, default: DEFAULT_PCT_IVA_CONSULTORIA, min: 0, max: 1 },
    fechaFactura: { type: Date, default: null },
    folio: { type: String, trim: true, default: '' },
    /** Ligado a Factura AdminSys para conciliación (unidad Consulting). */
    facturaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Factura',
      default: null,
      index: true,
    },
    notas: { type: String, trim: true, default: '' },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
);

consultoriaIngresoProyectoSchema.index({ anio: 1, mes: 1 });
consultoriaIngresoProyectoSchema.index({ proyectoId: 1, anio: 1, mes: 1 });

export const ConsultoriaIngresoProyecto = mongoose.model(
  'ConsultoriaIngresoProyecto',
  consultoriaIngresoProyectoSchema
);
