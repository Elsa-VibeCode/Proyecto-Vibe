#!/usr/bin/env node
/**
 * Seed Consultoría: Mario + propuestas enero 2025.
 * Uso: npm run seed:consultoria
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { seedPropuestasEnero2025 } from '../src/services/consultoriaService.js';

async function main() {
  await connectDB();
  console.log('=== Seed Consultoría (BWConsulting) ===');
  const r = await seedPropuestasEnero2025({
    clerkUserId: 'seed-script',
    email: 'seed@local',
  });
  console.log(`  propuestas: ${r.creadas} creadas, ${r.actualizadas} actualizadas (${r.total} total)`);
  console.log('Listo.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
