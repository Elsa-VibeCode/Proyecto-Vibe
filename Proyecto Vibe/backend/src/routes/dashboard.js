import { Router } from 'express';
import { User } from '../models/User.js';
import { protegerRuta } from '../middleware/auth.js';

const router = Router();

router.use(protegerRuta);

router.get('/estadisticas', async (req, res) => {
  const [totalUsuarios, usuariosActivos, porRol, recientes] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ activo: true }),
    User.aggregate([
      { $group: { _id: '$rol', cantidad: { $sum: 1 } } },
    ]),
    User.find()
      .select('nombre email rol activo createdAt ultimoAcceso')
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  const roles = porRol.reduce(
    (acc, item) => {
      acc[item._id] = item.cantidad;
      return acc;
    },
    { admin: 0, editor: 0, visor: 0 }
  );

  res.json({
    estadisticas: {
      totalUsuarios,
      usuariosActivos,
      usuariosInactivos: totalUsuarios - usuariosActivos,
      roles,
      usuariosRecientes: recientes,
      zonaHoraria: 'America/Mexico_City',
      fechaConsulta: new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
      }),
    },
  });
});

export default router;
