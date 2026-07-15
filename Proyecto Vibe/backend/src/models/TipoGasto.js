import mongoose from 'mongoose';

// Catálogo editable de tipos de gasto usados en el módulo de Egresos.
export const TIPOS_GASTO_INICIALES = [
  'NOMINA',
  'HONORARIOS',
  'COMISIONES',
  'ARRENDAMIENTOS',
  'CELULARES',
  'CREDITOS',
  'IMPUESTOS FEDERALES',
  'COMISIONES BANCARIAS',
  'COMISIONES INTERNACIONALES',
  'GASTOS DE REPRESENTACIÓN',
  'GASTOS DE VIAJE',
  'DONATIVOS',
  'CUOTAS Y SUSCRIPCIONES',
  'AMERICAN EXPRESS',
  'SOPORTE SISTEMAS',
  'GASTOS DE OPERACIÓN',
  'REEMBOLSOS',
  'TARJETA KONFIO',
  'TENENCIA',
  'MANTENIMIENTO',
  'PUBLICIDAD',
  'SERVICIOS',
  'OTROS',
];

const tipoGastoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const TipoGasto = mongoose.model('TipoGasto', tipoGastoSchema);

// Inserta el catálogo inicial si la colección está vacía. Idempotente:
// si ya hay tipos (p. ej. agregados desde la UI), no hace nada.
export async function asegurarTiposGasto() {
  const total = await TipoGasto.estimatedDocumentCount();
  if (total > 0) return 0;

  const docs = TIPOS_GASTO_INICIALES.map((nombre, i) => ({
    nombre: nombre.toUpperCase(),
    activo: true,
    orden: i,
  }));
  await TipoGasto.insertMany(docs, { ordered: false }).catch(() => {});
  return docs.length;
}
