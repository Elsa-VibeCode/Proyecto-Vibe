import mongoose from 'mongoose';

const montosUnidadSchema = new mongoose.Schema(
  {
    consulting: { type: Number, default: 0 },
    technologies: { type: Number, default: 0 },
    grupo: { type: Number, default: 0 },
  },
  { _id: false }
);

const resumenMensualFlujoSchema = new mongoose.Schema(
  {
    periodo: { type: String, required: true, trim: true, index: true, unique: true },
    ingresos: { type: montosUnidadSchema, default: () => ({}) },
    egresos: {
      consultingNomina: { type: Number, default: 0 },
      technologiesNomina: { type: Number, default: 0 },
      grupoDirecto: { type: Number, default: 0 },
    },
    resultadoNeto: {
      consulting: { type: Number, default: 0 },
      technologies: { type: Number, default: 0 },
      grupo: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    saldoAcumulado: {
      consulting: { type: Number, default: 0 },
      technologies: { type: Number, default: 0 },
      grupo: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    aportacionOficial: { type: Number, default: 0 },
    egresosTotalesACubrir: { type: Number, default: 0 },
    porcentajeCoberturaOficial: { type: Number, default: 0 },
    registrosPendientes: { type: Number, default: 0 },
    totalRegistrosMes: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  }
);

export const ResumenMensualFlujo = mongoose.model('ResumenMensualFlujo', resumenMensualFlujoSchema);
