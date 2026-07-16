import { Router } from 'express';
import { protegerRuta } from '../middleware/auth.js';
import { obtenerPanel } from '../services/panel/panelService.js';
import { esMesValido, mesActualSistema } from '../services/panel/mesUtils.js';

const router = Router();

router.use(protegerRuta);

router.get('/', async (req, res) => {
  try {
    const mes = esMesValido(req.query.mes) ? req.query.mes : mesActualSistema();
    const refrescar = req.query.refrescar === 'true' || req.query.refrescar === '1';
    const data = await obtenerPanel(mes, { refrescar });
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error panel:', err);
    res.status(500).json({ ok: false, error: err.message || 'Error al cargar panel' });
  }
});

export default router;
