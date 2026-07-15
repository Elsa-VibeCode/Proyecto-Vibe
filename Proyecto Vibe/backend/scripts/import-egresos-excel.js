import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { parsearEgresosDesdeExcel, insertarEgresos } from '../src/services/egresoService.js';

// Uso: npm run import:egresos -- --file=path/al/archivo.xlsx [--hoja="Captura Egresos"]
function leerArg(nombre) {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg ? arg.slice(prefijo.length) : undefined;
}

const file = leerArg('file');
const hoja = leerArg('hoja');

if (!file) {
  console.error('Uso: npm run import:egresos -- --file=path/al/archivo.xlsx [--hoja="Captura Egresos"]');
  process.exit(1);
}

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada');
  process.exit(1);
}

const buffer = readFileSync(file);
const { hoja: hojaUsada, registros, errores } = parsearEgresosDesdeExcel(buffer, {
  nombreHoja: hoja,
});

console.log(`Hoja usada: "${hojaUsada}" — ${registros.length} filas válidas, ${errores.length} omitidas.`);

await mongoose.connect(process.env.MONGODB_URI);
const { creados, fallidos } = await insertarEgresos(registros);
console.log(`✓ Egresos insertados: ${creados}. Fallidos: ${fallidos.length}.`);
if (fallidos.length) {
  console.log(fallidos.slice(0, 10).map((f) => `  - ${f.motivo}`).join('\n'));
}
await mongoose.disconnect();
