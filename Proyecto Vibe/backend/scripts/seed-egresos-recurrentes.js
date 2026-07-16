import 'dotenv/config';
import { connectDB } from '../src/config/db.js';
import { EgresoRecurrente } from '../src/models/EgresoRecurrente.js';

const recurrentes = [
  { nombre: 'Crédito Konfío mensual', tipoGasto: 'CREDITOS', proveedorEsperado: 'KONFIO', diaEsperado: 8, montoReferencia: 30704.74 },
  { nombre: 'Tarjeta Konfío mensual', tipoGasto: 'TARJETA KONFIO', proveedorEsperado: 'KONFIO', diaEsperado: 30, montoReferencia: 24000 },
  { nombre: 'LATAM Konfío mensual', tipoGasto: 'TARJETA KONFIO', proveedorEsperado: 'KONFIO', diaEsperado: 30, montoReferencia: 7153.33, tolerancia: 0.05 },
  { nombre: 'Renta Kasiopea', tipoGasto: 'ARRENDAMIENTOS', proveedorEsperado: 'KASIOPEA', diaEsperado: 7, montoReferencia: 1576 },
  { nombre: 'IZZI internet', tipoGasto: 'ARRENDAMIENTOS', proveedorEsperado: 'IZZI', diaEsperado: 16, montoReferencia: 500 },
  { nombre: 'Contadores GCG', tipoGasto: 'HONORARIOS', proveedorEsperado: 'GCG', diaEsperado: 15, montoReferencia: 19662 },
  { nombre: 'Impuestos SAT ISR', tipoGasto: 'IMPUESTOS FEDERALES', proveedorEsperado: 'SAT', diaEsperado: 17, montoReferencia: 5000 },
  { nombre: 'Impuestos SAT IVA', tipoGasto: 'IMPUESTOS FEDERALES', proveedorEsperado: 'SAT', diaEsperado: 17, montoReferencia: 2000 },
  { nombre: 'Honorarios Abogado (Roberto Fuentes)', tipoGasto: 'HONORARIOS', proveedorEsperado: 'ROBERTO FUENTES', diaEsperado: 15, montoReferencia: 12490 },
  { nombre: 'Telcel plan', tipoGasto: 'CELULARES', proveedorEsperado: 'RADIOMOVIL DIPSA', diaEsperado: 13, montoReferencia: 3294 },
  { nombre: 'Comisiones bancarias BBVA', tipoGasto: 'COMISIONES BANCARIAS', proveedorEsperado: 'BBVA', diaEsperado: 7, montoReferencia: 600 },
];

async function seed() {
  await connectDB();
  let creados = 0;
  let actualizados = 0;

  for (const item of recurrentes) {
    const existente = await EgresoRecurrente.findOne({ nombre: item.nombre });
    if (existente) {
      await EgresoRecurrente.updateOne({ _id: existente._id }, { $set: { ...item, activo: true } });
      actualizados += 1;
    } else {
      await EgresoRecurrente.create({ ...item, unidad: 'Grupo', activo: true });
      creados += 1;
    }
  }

  console.log(`✓ Egresos recurrentes: ${creados} creados, ${actualizados} actualizados`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
