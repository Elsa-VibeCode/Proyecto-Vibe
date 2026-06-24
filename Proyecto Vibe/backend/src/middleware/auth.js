import crypto from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import { User } from '../models/User.js';
import { getClerkClient } from '../utils/clerk.js';

async function sincronizarUsuario(clerkUserId) {
  let usuario = await User.findOne({ clerkId: clerkUserId });

  if (usuario) return usuario;

  const clerkUser = await getClerkClient().users.getUser(clerkUserId);
  const email = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
    ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error('Usuario sin correo en Clerk');
  }

  usuario = await User.findOne({ email });

  if (usuario) {
    usuario.clerkId = clerkUserId;
    if (!usuario.nombre) {
      usuario.nombre =
        clerkUser.firstName ||
        clerkUser.username ||
        email.split('@')[0];
    }
    await usuario.save();
    return usuario;
  }

  return User.create({
    clerkId: clerkUserId,
    email,
    nombre: clerkUser.firstName || clerkUser.username || email.split('@')[0],
    password: crypto.randomBytes(32).toString('hex'),
    rol: email === 'admin@ejemplo.com' ? 'admin' : 'visor',
  });
}

export async function protegerRuta(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ mensaje: 'Acceso no autorizado' });
  }

  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    return res.status(500).json({ mensaje: 'CLERK_SECRET_KEY no configurada en el servidor' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const secretKey = process.env.CLERK_SECRET_KEY.trim();
    const payload = await verifyToken(token, {
      secretKey,
    });

    const clerkUserId = payload.sub;
    const usuario = await sincronizarUsuario(clerkUserId);

    if (!usuario.activo) {
      return res.status(401).json({ mensaje: 'Usuario no válido o inactivo' });
    }

    usuario.ultimoAcceso = new Date();
    await usuario.save();

    req.usuario = usuario;
    req.clerkUserId = clerkUserId;
    next();
  } catch (error) {
    console.error('Error de autenticación Clerk:', error.message);
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
}

export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: 'No tienes permisos para esta acción' });
    }
    next();
  };
}
