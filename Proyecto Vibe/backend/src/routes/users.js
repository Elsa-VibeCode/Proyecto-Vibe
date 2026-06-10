import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { protegerRuta, requiereRol } from '../middleware/auth.js';

const router = Router();

router.use(protegerRuta);

router.get('/', requiereRol('admin', 'editor'), async (req, res) => {
  const { busqueda, rol, activo, pagina = 1, limite = 10 } = req.query;

  const filtro = {};

  if (busqueda) {
    filtro.$or = [
      { nombre: { $regex: busqueda, $options: 'i' } },
      { email: { $regex: busqueda, $options: 'i' } },
    ];
  }

  if (rol) filtro.rol = rol;
  if (activo !== undefined) filtro.activo = activo === 'true';

  const skip = (Number(pagina) - 1) * Number(limite);

  const [usuarios, total] = await Promise.all([
    User.find(filtro)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limite)),
    User.countDocuments(filtro),
  ]);

  res.json({
    usuarios,
    paginacion: {
      total,
      pagina: Number(pagina),
      limite: Number(limite),
      paginas: Math.ceil(total / Number(limite)),
    },
  });
});

router.get('/:id', requiereRol('admin', 'editor'), async (req, res) => {
  const usuario = await User.findById(req.params.id).select('-password');
  if (!usuario) {
    return res.status(404).json({ mensaje: 'Usuario no encontrado' });
  }
  res.json({ usuario });
});

router.post(
  '/',
  requiereRol('admin'),
  [
    body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('email').isEmail().withMessage('Correo electrónico inválido'),
    body('password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
    body('rol').optional().isIn(['admin', 'editor', 'visor']).withMessage('Rol inválido'),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array() });
    }

    const existe = await User.findOne({ email: req.body.email });
    if (existe) {
      return res.status(409).json({ mensaje: 'El correo ya está registrado' });
    }

    const usuario = await User.create(req.body);
    res.status(201).json({
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        activo: usuario.activo,
      },
    });
  }
);

router.put(
  '/:id',
  requiereRol('admin'),
  [
    body('nombre').optional().trim().notEmpty(),
    body('email').optional().isEmail(),
    body('rol').optional().isIn(['admin', 'editor', 'visor']),
    body('activo').optional().isBoolean(),
    body('password').optional().isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array() });
    }

    const usuario = await User.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const { nombre, email, rol, activo, password } = req.body;

    if (email && email !== usuario.email) {
      const existe = await User.findOne({ email });
      if (existe) {
        return res.status(409).json({ mensaje: 'El correo ya está registrado' });
      }
      usuario.email = email;
    }

    if (nombre) usuario.nombre = nombre;
    if (rol) usuario.rol = rol;
    if (activo !== undefined) usuario.activo = activo;
    if (password) usuario.password = password;

    await usuario.save();

    res.json({
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        activo: usuario.activo,
      },
    });
  }
);

router.delete('/:id', requiereRol('admin'), async (req, res) => {
  if (req.params.id === req.usuario._id.toString()) {
    return res.status(400).json({ mensaje: 'No puedes eliminar tu propia cuenta' });
  }

  const usuario = await User.findByIdAndDelete(req.params.id);
  if (!usuario) {
    return res.status(404).json({ mensaje: 'Usuario no encontrado' });
  }

  res.json({ mensaje: 'Usuario eliminado correctamente' });
});

export default router;
