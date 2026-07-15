import mongoose from 'mongoose';

// "Strategy" es una unidad legacy: se conserva como valor almacenable pero se
// mapea a "Consulting" al leer (ver unidadEfectiva). `null` = sin clasificar.
export const UNIDADES_FACTURA = ['Consulting', 'Technologies', 'Grupo', 'Strategy'];
export const ESTATUS_ENVIO = ['ENVIADA', 'POR_ENVIAR', 'CANCELADA'];
export const ESTATUS_PAGO = ['PAGADO', 'PENDIENTE', 'PARCIAL', 'VENCIDO', 'CANCELADO'];
export const RFC_EMISOR = ['GBL', 'GAVM', 'OTRO'];

// Mapea la unidad almacenada a la unidad "efectiva" para lectura/agrupación.
export function unidadEfectiva(unidad) {
  if (!unidad) return 'sin_clasificar';
  if (unidad === 'Strategy') return 'Consulting';
  return unidad;
}

export function esFechaFacturaValida(fecha) {
  if (!fecha) return false;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return false;
  return d.getUTCFullYear() >= 2000;
}

export function mesDesdeFecha(fecha) {
  if (!esFechaFacturaValida(fecha)) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

const facturaSchema = new mongoose.Schema(
  {
    fechaFacturacion: { type: Date, required: true, index: true },
    fechaPago: { type: Date, default: null },
    // noFactura único entre facturas activas (índice parcial con deletedAt).
    noFactura: { type: String, required: true, trim: true },
    cliente: { type: String, required: true, trim: true, index: true },
    concepto: { type: String, trim: true, default: '' },
    unidad: { type: String, enum: [...UNIDADES_FACTURA, null], default: null },
    unidadManual: { type: Boolean, default: false }, // true = asignada factura por factura (no se sobrescribe)
    subtotal: { type: Number, default: 0 },
    iva: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    estatusEnvio: { type: String, enum: ESTATUS_ENVIO, default: undefined },
    estatusPago: { type: String, enum: ESTATUS_PAGO, default: undefined },
    complementoPago: { type: String, trim: true, default: '' },
    rfcEmisor: { type: String, enum: RFC_EMISOR, default: 'GBL' },
    mes: { type: String, index: true }, // YYYY-MM, calculado en pre-validate
    clasificacionAuto: { type: Boolean, default: false }, // true = vino del mapa
    // Marca las facturas creadas por la migración desde Excel (respaldo/trazabilidad).
    origen: { type: String, enum: ['excel-migracion', 'manual', 'sicofi'], default: 'manual' },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

facturaSchema.index(
  { noFactura: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

facturaSchema.pre('validate', function calcularMes() {
  if (this.fechaFacturacion) {
    this.mes = mesDesdeFecha(this.fechaFacturacion);
  }
});

facturaSchema.index({ fechaPago: 1, estatusPago: 1 });

export const Factura = mongoose.model('Factura', facturaSchema);
