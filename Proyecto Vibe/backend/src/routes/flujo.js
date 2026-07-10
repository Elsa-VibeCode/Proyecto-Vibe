import { Router } from 'express';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import {
  obtenerResumenFlujo,
  recalcularResumenMensualFlujo,
  obtenerOcrearConfiguracion,
  actualizarConfiguracionFlujo,
} from '../services/flujoService.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

router.use(protegerRuta);

router.get('/resumen', async (_req, res) => {
  const data = await obtenerResumenFlujo();
  res.json(data);
});

router.get('/configuracion', async (_req, res) => {
  const config = await obtenerOcrearConfiguracion();
  res.json({ configuracion: config });
});

router.put('/configuracion', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const configuracion = await actualizarConfiguracionFlujo(req.body, req.usuario._id);
    res.json({ configuracion });
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
});

router.post('/recalcular', requiereRol(...ROLES_EDICION), async (req, res) => {
  const resultado = await recalcularResumenMensualFlujo(req.usuario._id);
  const resumen = await obtenerResumenFlujo();
  res.json({
    mensaje: `Flujo recalculado: ${resultado.mesesGuardados} mes(es) actualizados.`,
    ...resultado,
    resumen,
  });
});

export default router;
