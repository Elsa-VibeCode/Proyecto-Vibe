import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';

dotenv.config();

async function seed() {
  await connectDB();

  const adminExistente = await User.findOne({ email: 'admin@ejemplo.com' });
  if (adminExistente) {
    console.log('El usuario administrador ya existe. No se realizaron cambios.');
    process.exit(0);
  }

  await User.create({
    nombre: 'Administrador',
    email: 'admin@ejemplo.com',
    password: 'admin123',
    rol: 'admin',
  });

  console.log('✓ Usuario administrador creado:');
  console.log('  Email: admin@ejemplo.com');
  console.log('  Contraseña: admin123');
  console.log('  ⚠ Cambia estas credenciales en producción');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Error al ejecutar seed:', err.message);
  process.exit(1);
});
