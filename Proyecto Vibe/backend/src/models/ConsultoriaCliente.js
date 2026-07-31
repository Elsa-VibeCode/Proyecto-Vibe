import mongoose from 'mongoose';
import { TIPOS_CLIENTE, UBICACIONES_CONSULTORIA } from '../utils/consultoriaConstants.js';

const consultoriaClienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    ubicacion: {
      type: String,
      enum: UBICACIONES_CONSULTORIA,
      default: 'OTROS',
      index: true,
    },
    tipoCliente: {
      type: String,
      enum: TIPOS_CLIENTE,
      default: 'NUEVO',
      index: true,
    },
    /** Razón social / alias para cruzar con Factura.cliente */
    razonSocialFactura: { type: String, trim: true, default: '' },
    activo: { type: Boolean, default: true, index: true },
    notas: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

consultoriaClienteSchema.index(
  { nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } }
);

export const ConsultoriaCliente = mongoose.model(
  'ConsultoriaCliente',
  consultoriaClienteSchema
);
