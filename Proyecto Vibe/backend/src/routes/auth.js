import { Router } from 'express';
import { protegerRuta } from '../middleware/auth.js';

const router = Router();

router.get('/perfil', protegerRuta, async (req, res) => {
  res.json({
    usuario: {
      id: req.usuario._id,
      nombre: req.usuario.nombre,
      email: req.usuario.email,
      rol: req.usuario.rol,
    },
  });
});

export default router;
