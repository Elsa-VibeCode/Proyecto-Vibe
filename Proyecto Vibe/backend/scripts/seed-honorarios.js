#!/usr/bin/env node
/**
 * Seed de consultores, proyectos y presets para Honorarios Consulting.
 * Uso: npm run seed:honorarios
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Consultant } from '../src/models/Consultant.js';
import { HonorarioProject } from '../src/models/HonorarioProject.js';
import { PercentagePreset } from '../src/models/PercentagePreset.js';
import {
  DEFAULTS_JUNIO_2026,
  DEFAULTS_PRE_JUNIO_2026,
} from '../src/utils/honorariosMotor.js';

const CONSULTORES = ['Chava', 'AP', 'Ulises', 'Elsa', 'Roberto', 'Tony'];

const PROYECTOS = [
  'NOVAMEX',
  'AF',
  'ENLAC',
  'FONDO DE FONDOS',
  'EDC CHIHUAHUA',
  'INDEX',
  'PICACHO',
  'CLÉS',
  'DEMEK',
  'TRICENTENARIO',
  'CÁRITAS',
  'CCI',
  'GRUPO SAN FRANCISCO',
  'THE EARTH LAB',
  'BRIDGE SOLUTIONS',
  'FUNDACIÓN INDEX',
];

const PRESETS = [
  {
    nombre: 'Estándar 2026 (desde jun)',
    ...DEFAULTS_JUNIO_2026,
  },
  {
    nombre: 'Pre-junio 2026 (TECH/DONATIVO 10%)',
    ...DEFAULTS_PRE_JUNIO_2026,
  },
  {
    nombre: 'DEMEK',
    pctTech: 0.05,
    pctLicencia: 0.2,
    pctGrupo: 0.1,
    pctFinder: 0.1,
    pctCloser: 0.15,
    pctEjecucion: 0.4,
  },
  {
    nombre: 'AF junio (TECH 3% / LIC 7%)',
    pctTech: 0.03,
    pctLicencia: 0.07,
    pctGrupo: 0.1,
    pctFinder: 0.1,
    pctCloser: 0.15,
    pctEjecucion: 0.65,
  },
  {
    nombre: 'Novamex sin licencia',
    pctTech: 0.05,
    pctLicencia: 0,
    pctGrupo: 0.1,
    pctFinder: 0.1,
    pctCloser: 0.15,
    pctEjecucion: 0.65,
  },
];

async function upsertPorNombre(Model, nombre, extra = {}) {
  return Model.findOneAndUpdate(
    { nombre },
    { $set: { nombre, activo: true, ...extra } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function main() {
  await connectDB();
  console.log('=== Seed Honorarios Consulting ===');

  for (const nombre of CONSULTORES) {
    await upsertPorNombre(Consultant, nombre);
    console.log(`  consultor: ${nombre}`);
  }

  for (const nombre of PROYECTOS) {
    await upsertPorNombre(HonorarioProject, nombre, { cliente: '' });
    console.log(`  proyecto: ${nombre}`);
  }

  for (const p of PRESETS) {
    await PercentagePreset.findOneAndUpdate(
      { nombre: p.nombre },
      { $set: p },
      { upsert: true, new: true }
    );
    console.log(`  preset: ${p.nombre}`);
  }

  console.log('Listo.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
