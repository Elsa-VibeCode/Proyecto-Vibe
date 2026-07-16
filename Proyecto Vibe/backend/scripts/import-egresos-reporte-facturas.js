/**
 * Importa egresos desde Reporte Facturas 2026.xlsx (hojas EGRESOS ENERO/FEB/MAR 2026).
 *
 * Uso:
 *   node --env-file=.env scripts/import-egresos-reporte-facturas.js \
 *     --file="/path/Reporte Facturas 2026.xlsx" \
 *     [--desde=2026-01] [--hasta=2026-06] [--dry-run] [--reemplazar]
 */
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Egreso } from '../src/models/Egreso.js';
import {
  parsearEgresosReporteFacturas,
  importarEgresosReporteFacturas,
} from '../src/services/reporteFacturasEgresoService.js';
import { invalidarPanelCompleto } from '../src/services/panel/invalidarPanel.js';

function leerArg(nombre) {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg ? arg.slice(prefijo.length) : undefined;
}

const file =
  leerArg('file') ??
  '/Users/elsaivettedominguezleon/Library/CloudStorage/GoogleDrive-bluewolfadm@gmail.com/My Drive/GRUPO BLWOLF SAPI DE CV/2026/Reportes GBL/Reporte Facturas 2026.xlsx';
const mesDesde = leerArg('desde') ?? '2026-01';
const mesHasta = leerArg('hasta') ?? '2026-06';
const dryRun = process.argv.includes('--dry-run');
const reemplazar = process.argv.includes('--reemplazar');

const buffer = readFileSync(file);
const { hojas, registros, errores } = parsearEgresosReporteFacturas(buffer, {
  mesDesde,
  mesHasta,
});

console.log(dryRun ? '=== DRY RUN ===' : '=== IMPORT EGRESOS REPORTE FACTURAS ===');
console.log(`Archivo: ${file}`);
console.log(`Rango: ${mesDesde} → ${mesHasta}\n`);

for (const h of hojas) {
  console.log(`  ${h.hoja}: ${h.registros} registros, ${h.errores} omitidos`);
}

const porMes = {};
for (const r of registros) {
  porMes[r.mes] = porMes[r.mes] ?? { n: 0, total: 0 };
  porMes[r.mes].n += 1;
  porMes[r.mes].total += r.subtotal;
}
console.log('\nPor mes:');
for (const [mes, { n, total }] of Object.entries(porMes).sort()) {
  console.log(`  ${mes}: ${n} egresos, subtotal $${total.toFixed(2)}`);
}

if (errores.length) {
  console.log(`\nErrores (${errores.length}, primeros 5):`);
  for (const e of errores.slice(0, 5)) console.log(`  - ${e.hoja} fila ${e.fila}: ${e.motivo}`);
}

if (registros.length === 0) {
  console.error('\nNo hay registros para importar.');
  process.exit(1);
}

await connectDB();

const mesesEnRango = [];
for (let y = Number(mesDesde.slice(0, 4)), m = Number(mesDesde.slice(5)); ; ) {
  const mes = `${y}-${String(m).padStart(2, '0')}`;
  mesesEnRango.push(mes);
  if (mes >= mesHasta) break;
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
}
const mesesSinDatos = mesesEnRango.filter((m) => !porMes[m]);
if (mesesSinDatos.length) {
  console.log(`\n⚠ Sin hoja de detalle para: ${mesesSinDatos.join(', ')} (no están en este Excel)`);
}

const { creados, fallidos } = await importarEgresosReporteFacturas(registros, {
  reemplazarMeses: reemplazar ? Object.keys(porMes) : [],
  dryRun,
});

console.log(`\n${dryRun ? '[dry-run] ' : ''}Importados: ${creados}. Fallidos: ${fallidos.length}.`);
if (fallidos.length) {
  for (const f of fallidos.slice(0, 5)) console.log(`  - ${f.hoja} fila ${f.fila}: ${f.motivo}`);
}

if (!dryRun) {
  invalidarPanelCompleto();
  for (const mes of Object.keys(porMes).sort()) {
    const tot = await Egreso.aggregate([
      { $match: { mes } },
      { $group: { _id: '$unidad', suma: { $sum: '$total' }, n: { $sum: 1 } } },
    ]);
    console.log(`\nVerificación ${mes}:`, tot.map((t) => `${t._id}=$${t.suma.toFixed(0)} (${t.n})`).join(', '));
  }
}

await mongoose.disconnect();
