import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { generarToken } from '../utils/token.js';
import { protegerRuta } from '../middleware/auth.js';

const router = Router();

router.post(
  '/registro',
  [
    body('email').isEmail().withMessage('Correo electrónico inválido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array() });
    }

    const { email, password } = req.body;
    const existe = await User.findOne({ email });

    if (existe) {
      return res.status(409).json({ mensaje: 'Este correo ya está registrado' });
    }

    const usuario = await User.create({ email, password });
    const token = generarToken(usuario);

    res.status(201).json({
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Correo electrónico inválido'),
    body('password').notEmpty().withMessage('La contraseña es obligatoria'),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array() });
    }

    const { email, password } = req.body;

    const usuario = await User.findOne({ email }).select('+password');
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
    }

    const passwordValida = await usuario.compararPassword(password);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
    }

    usuario.ultimoAcceso = new Date();
    await usuario.save();

    const token = generarToken(usuario);

    res.json({
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  }
);

router.get('/perfil', protegerRuta, async (req, res) => {
  res.json({ usuario: req.usuario });
});

export default router;
