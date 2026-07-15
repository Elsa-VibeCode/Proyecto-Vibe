import mongoose from 'mongoose';
import { TipoGasto, TIPOS_GASTO_INICIALES } from '../src/models/TipoGasto.js';

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

let creados = 0;
for (let i = 0; i < TIPOS_GASTO_INICIALES.length; i++) {
  const nombre = TIPOS_GASTO_INICIALES[i].toUpperCase();
  const resultado = await TipoGasto.updateOne(
    { nombre },
    { $setOnInsert: { nombre, activo: true, orden: i } },
    { upsert: true }
  );
  if (resultado.upsertedCount) creados += 1;
}

console.log(`✓ Tipos de gasto: ${creados} creados, ${TIPOS_GASTO_INICIALES.length - creados} ya existían.`);
await mongoose.disconnect();
