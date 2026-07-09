import mongoose from 'mongoose';
import { User } from '../models/User.js';

const email = process.argv[2]?.trim().toLowerCase();
const rol = process.argv[3]?.trim() ?? 'editor';

if (!email) {
  console.error('Uso: node src/scripts/promoteUser.js <correo> [rol]');
  console.error('Roles: admin | editor | visor');
  process.exit(1);
}

if (!['admin', 'editor', 'visor'].includes(rol)) {
  console.error('Rol inválido:', rol);
  process.exit(1);
}

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI no configurada');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const usuario = await User.findOne({ email });
if (!usuario) {
  console.error('No se encontró usuario con correo:', email);
  await mongoose.disconnect();
  process.exit(1);
}

const anterior = usuario.rol;
usuario.rol = rol;
await usuario.save();

console.log(`✓ ${usuario.nombre || email}: ${anterior} → ${rol}`);
await mongoose.disconnect();
