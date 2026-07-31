import mongoose from 'mongoose';

/**
 * Bitácora de cambios (cierre de mes, ediciones post-cierre, overrides).
 */
const consultoriaAuditLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, trim: true, default: '' },
    entidad: {
      type: String,
      required: true,
      enum: [
        'ConsultoriaCliente',
        'ConsultoriaPropuesta',
        'ConsultoriaProyecto',
        'ConsultoriaIngresoProyecto',
        'ConsultoriaIngresoMensual',
        'ConsultoriaNominaMensual',
      ],
      index: true,
    },
    entidadId: { type: String, required: true, index: true },
    accion: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'CERRAR_MES', 'REABRIR_MES', 'OVERRIDE'],
      required: true,
    },
    campo: { type: String, trim: true, default: '' },
    valorAnterior: { type: mongoose.Schema.Types.Mixed, default: null },
    valorNuevo: { type: mongoose.Schema.Types.Mixed, default: null },
    justificacion: { type: String, trim: true, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

consultoriaAuditLogSchema.index({ createdAt: -1 });

export const ConsultoriaAuditLog = mongoose.model(
  'ConsultoriaAuditLog',
  consultoriaAuditLogSchema
);
