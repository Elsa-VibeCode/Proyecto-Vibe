#!/usr/bin/env node
/**
 * Seed Consultoría: Mario + propuestas enero 2025.
 * Uso: npm run seed:consultoria
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { seedPropuestasEnero2025, seedProyectosOperacion } from '../src/services/consultoriaService.js';
import { seedHistoricoIngresos } from '../src/services/consultoriaIngresosService.js';

async function main() {
  await connectDB();
  console.log('=== Seed Consultoría (BWConsulting) ===');
  const p = await seedPropuestasEnero2025({
    clerkUserId: 'seed-script',
    email: 'seed@local',
  });
  console.log(`  propuestas: ${p.creadas} creadas, ${p.actualizadas} actualizadas (${p.total} total)`);
  const pr = await seedProyectosOperacion({
    clerkUserId: 'seed-script',
    email: 'seed@local',
  });
  console.log(`  proyectos: ${pr.creadas} creadas, ${pr.actualizadas} actualizadas (${pr.total} total)`);
  const h = await seedHistoricoIngresos({
    clerkUserId: 'seed-script',
    email: 'seed@local',
  });
  console.log(`  histórico ingresos: ${h.upserts} años`);
  console.log('Listo.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
