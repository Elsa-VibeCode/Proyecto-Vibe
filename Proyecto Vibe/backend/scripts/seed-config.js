import mongoose from 'mongoose';
import { Config, CONFIG_DEFAULT } from '../src/models/Config.js';

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const existente = await Config.findOne({ clave: 'global' });
if (existente) {
  console.log('La configuración global ya existe. No se realizaron cambios:');
  console.log(`  aporteConsultingPct: ${existente.aporteConsultingPct}`);
  console.log(`  fechaVigenciaRegla:  ${existente.fechaVigenciaRegla}`);
  console.log(`  latamKonfioMensual:  ${existente.latamKonfioMensual}`);
} else {
  await Config.create({ clave: 'global', ...CONFIG_DEFAULT });
  console.log('✓ Configuración global creada con valores por defecto:');
  console.log(`  aporteConsultingPct: ${CONFIG_DEFAULT.aporteConsultingPct}`);
  console.log(`  fechaVigenciaRegla:  ${CONFIG_DEFAULT.fechaVigenciaRegla}`);
  console.log(`  latamKonfioMensual:  ${CONFIG_DEFAULT.latamKonfioMensual}`);
}

await mongoose.disconnect();
