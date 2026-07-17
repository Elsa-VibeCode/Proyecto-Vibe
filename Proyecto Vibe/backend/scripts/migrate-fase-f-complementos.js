/**
 * Migración Fase F: campos de complemento de pago en Factura.
 * Ejecutar una vez al desplegar: npm run migrate:fase-f
 */
import mongoose from 'mongoose';
import { Factura } from '../src/models/Factura.js';

const dryRun = process.argv.includes('--dry-run');

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const cursor = Factura.find({
  deletedAt: null,
  $or: [{ metodoPago: { $exists: false } }, { metodoPago: null }, { metodoPago: '' }],
});

let count = 0;
for await (const factura of cursor) {
  count += 1;
  if (dryRun) continue;

  factura.metodoPago = 'NA';
  factura.requiereComplemento = false;
  factura.montoPagado = factura.montoPagado ?? 0;
  factura.complementosEmitidos = factura.complementosEmitidos ?? [];
  await factura.save();
}

console.log(`Facturas sin metodoPago: ${count}`);
if (dryRun) {
  console.log('[dry-run] No se escribió en la base de datos.');
} else {
  console.log(`Actualizadas: ${count}`);
  console.log(
    'Panel mostrará alerta para metodoPago=NA. Corrígelas manualmente a PUE o PPD en Facturación.'
  );
}

await mongoose.disconnect();
