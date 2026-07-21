#!/usr/bin/env node
/**
 * Actualiza metodoPago (PUE/PPD) en bloque desde export CSV/Excel de Sicofi.
 *
 * Uso:
 *   npm run import:metodo-pago-sicofi -- ruta/al/export.csv
 *   npm run import:metodo-pago-sicofi -- ruta/al/export.csv --dry-run
 *
 * El CSV debe incluir columnas de facturas tipo I con "Método de pago" (PUE/PPD).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import {
  aplicarMetodoPagoDesdeSicofi,
  imprimirReporte,
} from '../src/services/metodoPagoSicofiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter((a) => a !== '--dry-run');

async function resolverArchivo() {
  if (args[0]) {
    const p = path.resolve(args[0]);
    await fs.access(p);
    return p;
  }

  const uploadsDir = path.join(__dirname, '../uploads/sicofi');
  try {
    const files = await fs.readdir(uploadsDir);
    const csvs = files.filter((f) => /\.(csv|xlsx|xls)$/i.test(f));
    if (!csvs.length) throw new Error('vacío');
    const stats = await Promise.all(
      csvs.map(async (f) => ({
        f,
        mtime: (await fs.stat(path.join(uploadsDir, f))).mtimeMs,
      }))
    );
    stats.sort((a, b) => b.mtime - a.mtime);
    return path.join(uploadsDir, stats[0].f);
  } catch {
    console.error('Indica la ruta del CSV de Sicofi:');
    console.error('  npm run import:metodo-pago-sicofi -- ~/Downloads/facturas-sicofi.csv');
    process.exit(1);
  }
}

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada (backend/.env)');
  process.exit(1);
}

const archivo = await resolverArchivo();
console.log(`Leyendo: ${archivo}`);

await mongoose.connect(process.env.MONGODB_URI);

try {
  const resumen = await aplicarMetodoPagoDesdeSicofi(archivo, { dryRun });
  imprimirReporte(resumen, { dryRun });

  const reportDir = path.join(__dirname, '../reports');
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportDir, `metodo-pago-sicofi-${stamp}.txt`);
  const lineas = [
    `Archivo: ${resumen.archivo}`,
    `PUE actualizadas: ${resumen.actualizadasPue}`,
    `PPD actualizadas: ${resumen.actualizadasPpd}`,
    `Siguen NA: ${resumen.aunNa}`,
    '',
    'PPD + pagadas (revisar REP):',
    ...resumen.revisarManual.map(
      (f) =>
        `${f.noFactura}\t${f.cliente}\t${f.total}\t${f.fechaPago}\t${f.estatusComplemento}`
    ),
  ];
  if (!dryRun) {
    await fs.writeFile(reportPath, lineas.join('\n'), 'utf8');
    console.log(`Reporte guardado: ${reportPath}`);
  }
} finally {
  await mongoose.disconnect();
}
