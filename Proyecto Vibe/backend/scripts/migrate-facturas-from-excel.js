import mongoose from 'mongoose';
import { Factura } from '../src/models/Factura.js';
import { migrarFacturasDesdeExcel } from '../src/services/facturaService.js';

// Uso: npm run migrate:facturas            → migra
//      npm run migrate:facturas -- --dry-run → solo reporta, no escribe
// NO borra la colección ExcelImport (queda como respaldo).

const dryRun = process.argv.includes('--dry-run');

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const antes = await Factura.countDocuments();
const resumen = await migrarFacturasDesdeExcel({ dryRun });
const despues = dryRun ? antes : await Factura.countDocuments();

if (!resumen.ok) {
  console.error('✗', resumen.error);
  await mongoose.disconnect();
  process.exit(1);
}

console.log(dryRun ? '=== SIMULACIÓN (no se escribió nada) ===' : '=== MIGRACIÓN COMPLETADA ===');
console.log(`Origen: ${resumen.origenImport.nombreArchivo} / hoja "${resumen.origenImport.nombreHoja}"`);
console.log(`Import ID:            ${resumen.origenImport.id}`);
console.log(`Filas en ExcelImport: ${resumen.origenImport.totalFilas}`);
console.log(`Procesadas (con datos): ${resumen.procesadas}`);
console.log(`Migradas (únicas):      ${resumen.migradas}`);
console.log(`Omitidas (sin datos):   ${resumen.omitidasSinDatos}`);
console.log(`Duplicados en fuente:   ${resumen.duplicadosEnFuente}`);
console.log(`Canceladas:             ${resumen.canceladas}`);
console.log(`Sin clasificar:         ${resumen.sinClasificar}`);
console.log('');
console.log('Por unidad (efectiva):');
for (const [u, n] of Object.entries(resumen.porUnidad ?? {})) {
  console.log(`  ${u}: ${n}`);
}
console.log('');
console.log('Alertas:');
console.log(`  Total = 0:    ${resumen.alertas?.totalCero?.length ?? 0}${(resumen.alertas?.totalCero?.length ?? 0) > 0 ? ' (ver muestra abajo)' : ''}`);
console.log(`  Sin cliente:  ${resumen.alertas?.sinCliente?.length ?? 0}`);
console.log(`  Sin fecha:    ${resumen.alertas?.sinFecha?.length ?? 0}`);

if (resumen.duplicados?.length) {
  console.log('');
  console.log('Duplicados detectados (muestra):');
  for (const d of resumen.duplicados.slice(0, 10)) {
    console.log(`  - ${d.noFactura} (${d.cliente})`);
  }
  if (resumen.duplicadosEnFuente > 10) {
    console.log(`  … y ${resumen.duplicadosEnFuente - Math.min(10, resumen.duplicados.length)} más`);
  }
}

for (const [tipo, items] of Object.entries(resumen.alertas ?? {})) {
  if (!items?.length) continue;
  console.log('');
  console.log(`Muestra alertas ${tipo}:`);
  for (const item of items.slice(0, 5)) {
    console.log(`  - ${JSON.stringify(item)}`);
  }
}

if (!dryRun) {
  console.log('');
  console.log(`Documentos en colección Factura: ${despues} (antes: ${antes})`);
}

await mongoose.disconnect();
