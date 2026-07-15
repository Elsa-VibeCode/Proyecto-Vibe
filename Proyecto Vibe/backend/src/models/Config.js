import mongoose from 'mongoose';

// Documento único de configuración de reglas de negocio.
// Se identifica siempre por `clave: 'global'` para forzar un singleton.
export const CONFIG_DEFAULT = {
  aporteConsultingPct: 0.1,
  fechaVigenciaRegla: '2026-04-01',
  latamKonfioMensual: 7153.33,
};

const configSchema = new mongoose.Schema(
  {
    clave: { type: String, default: 'global', unique: true },
    aporteConsultingPct: { type: Number, default: CONFIG_DEFAULT.aporteConsultingPct },
    fechaVigenciaRegla: { type: String, default: CONFIG_DEFAULT.fechaVigenciaRegla },
    latamKonfioMensual: { type: Number, default: CONFIG_DEFAULT.latamKonfioMensual },
  },
  { timestamps: true }
);

export const Config = mongoose.model('Config', configSchema);

// Devuelve el documento de configuración, creándolo con valores default si no existe.
export async function obtenerConfig() {
  let config = await Config.findOne({ clave: 'global' });
  if (!config) {
    config = await Config.create({ clave: 'global', ...CONFIG_DEFAULT });
  }
  return config;
}
