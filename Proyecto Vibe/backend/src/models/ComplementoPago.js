import mongoose from 'mongoose';

export const FORMAS_PAGO_SAT = ['01', '02', '03', '04', '28', '99'];
export const MONEDAS_COMPLEMENTO = ['MXN', 'USD', 'EUR'];
export const UNIDADES_COMPLEMENTO = ['Consulting', 'Technologies', 'Grupo'];

const facturaRelacionadaSchema = new mongoose.Schema(
  {
    facturaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Factura', required: true },
    noFactura: String,
    uuidFactura: String,
    importePagado: { type: Number, required: true },
    numParcialidad: { type: Number, default: 1 },
    saldoAnterior: Number,
    saldoInsoluto: Number,
    monedaP: String,
  },
  { _id: false }
);

const complementoPagoSchema = new mongoose.Schema(
  {
    uuid: { type: String, unique: true, sparse: true, index: true, trim: true, lowercase: true },
    folio: { type: String, index: true, trim: true },
    fechaEmision: { type: Date, required: true, index: true },
    fechaPago: { type: Date, required: true, index: true },
    monto: { type: Number, required: true },
    moneda: { type: String, enum: MONEDAS_COMPLEMENTO, default: 'MXN' },
    tipoCambio: { type: Number, default: 1 },
    formaPago: { type: String, enum: FORMAS_PAGO_SAT, default: '03' },
    cuentaBeneficiaria: String,
    facturasRelacionadas: [facturaRelacionadaSchema],
    unidad: { type: String, enum: UNIDADES_COMPLEMENTO, index: true },
    cliente: String,
    observaciones: String,
    origen: { type: String, enum: ['manual', 'sicofi_import'], default: 'manual' },
    createdBy: String,
  },
  { timestamps: true }
);

complementoPagoSchema.index({ fechaPago: -1, unidad: 1 });

complementoPagoSchema.pre('validate', function validarSumaImportes() {
  if (!this.facturasRelacionadas?.length) {
    this.invalidate('facturasRelacionadas', 'Debe incluir al menos una factura relacionada');
    return;
  }
  const suma = this.facturasRelacionadas.reduce(
    (acc, r) => acc + (Number(r.importePagado) || 0),
    0
  );
  const monto = Number(this.monto) || 0;
  if (Math.abs(suma - monto) > 0.01) {
    this.invalidate(
      'monto',
      `La suma de importes pagados (${suma.toFixed(2)}) debe igualar el monto del complemento (${monto.toFixed(2)})`
    );
  }
});

export const ComplementoPago = mongoose.model('ComplementoPago', complementoPagoSchema);
