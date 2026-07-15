import mongoose from 'mongoose';

export const ESTADOS_RESULTADO = ['ADMINISTRATIVO', 'OPERATIVO', 'COMERCIAL', 'FINANCIERO'];
export const UNIDADES = ['Grupo', 'Consulting', 'Technologies', 'Todos'];
export const METODOS_PAGO = [
  'TRANSFERENCIA',
  'EFECTIVO',
  'TARJETA',
  'SPEI',
  'CHEQUE',
  'DOMICILIACION',
  'OTRO',
];
export const TIPOS_IMPUESTO = ['IVA_16', 'IVA_8', 'EXENTO', 'CERO', 'ISR_RETENIDO'];

// Factores de impuesto por tipo. ISR_RETENIDO es una retención (resta al total).
export const FACTORES_IMPUESTO = {
  IVA_16: 0.16,
  IVA_8: 0.08,
  EXENTO: 0,
  CERO: 0,
  ISR_RETENIDO: -0.10467,
};

const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

export function calcularMontos({ subtotal, tipoImpuesto }) {
  const base = Number(subtotal) || 0;
  const factor = FACTORES_IMPUESTO[tipoImpuesto] ?? 0;
  const impuesto = redondear(base * factor);
  const total = redondear(base + impuesto);
  return { impuesto, total };
}

export function mesDesdeFecha(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

const egresoSchema = new mongoose.Schema(
  {
    fechaGasto: { type: Date, required: true, index: true },
    proyecto: { type: String, trim: true },
    estadoResultado: {
      type: String,
      enum: ESTADOS_RESULTADO,
      required: true,
    },
    unidad: {
      type: String,
      enum: UNIDADES,
      required: true,
      index: true,
    },
    tipoGasto: { type: String, required: true, trim: true, index: true },
    tipoSubgasto: { type: String, trim: true },
    metodoPago: { type: String, enum: METODOS_PAGO },
    noFactura: { type: String, trim: true, index: true },
    proveedor: { type: String, required: true, trim: true, index: true },
    concepto: { type: String, required: true, trim: true },
    subtotal: { type: Number, required: true },
    tipoImpuesto: {
      type: String,
      enum: TIPOS_IMPUESTO,
      default: 'IVA_16',
    },
    impuesto: { type: Number, required: true, default: 0 }, // calculado en pre-validate
    total: { type: Number, required: true, default: 0 }, // calculado en pre-validate
    mes: { type: String, index: true }, // formato YYYY-MM, calculado
    esTransferLatam: { type: Boolean, default: false }, // auto-flag si concepto contiene "LATAM"
  },
  { timestamps: true }
);

// Se usa pre-validate (no pre-save) para que impuesto/total/mes existan
// antes de que corran los validadores `required`.
egresoSchema.pre('validate', function calcularCampos() {
  const { impuesto, total } = calcularMontos({
    subtotal: this.subtotal,
    tipoImpuesto: this.tipoImpuesto,
  });
  this.impuesto = impuesto;
  this.total = total;
  if (this.fechaGasto) {
    this.mes = mesDesdeFecha(this.fechaGasto);
  }
  this.esTransferLatam = /latam/i.test(this.concepto ?? '');
});

export const Egreso = mongoose.model('Egreso', egresoSchema);
