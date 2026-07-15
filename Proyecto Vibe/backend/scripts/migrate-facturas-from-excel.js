import mongoose from 'mongoose';
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

const resumen = await migrarFacturasDesdeExcel({ dryRun });

if (!resumen.ok) {
  console.error('✗', resumen.error);
  await mongoose.disconnect();
  process.exit(1);
}

console.log(dryRun ? '=== SIMULACIÓN (no se escribió nada) ===' : '=== MIGRACIÓN COMPLETADA ===');
console.log(`Origen: ${resumen.origenImport.nombreArchivo} / hoja "${resumen.origenImport.nombreHoja}"`);
console.log(`Filas en el Excel:      ${resumen.origenImport.totalFilas}`);
console.log(`Procesadas (con datos): ${resumen.procesadas}`);
console.log(`Migradas:               ${resumen.migradas}`);
console.log(`Sin clasificar:         ${resumen.sinClasificar}`);
console.log(`Canceladas:             ${resumen.canceladas}`);
console.log(`Duplicados en fuente:   ${resumen.duplicadosEnFuente}`);
console.log(`Omitidas (sin datos):   ${resumen.omitidasSinDatos}`);

await mongoose.disconnect();
