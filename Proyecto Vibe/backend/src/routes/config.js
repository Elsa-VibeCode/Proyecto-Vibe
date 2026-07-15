import { Router } from 'express';
import { Config, obtenerConfig } from '../models/Config.js';
import { protegerRuta } from '../middleware/auth.js';

const router = Router();

router.use(protegerRuta);

// GET /api/config → configuración global (se crea con defaults si no existe)
router.get('/', async (_req, res) => {
  const config = await obtenerConfig();
  res.json({ config });
});

// PUT /api/config → actualiza las reglas de negocio
router.put('/', async (req, res) => {
  await obtenerConfig(); // asegura que exista
  const cambios = {};
  if (req.body.aporteConsultingPct !== undefined) {
    cambios.aporteConsultingPct = Number(req.body.aporteConsultingPct);
  }
  if (req.body.fechaVigenciaRegla !== undefined) {
    cambios.fechaVigenciaRegla = String(req.body.fechaVigenciaRegla);
  }
  if (req.body.latamKonfioMensual !== undefined) {
    cambios.latamKonfioMensual = Number(req.body.latamKonfioMensual);
  }

  const config = await Config.findOneAndUpdate({ clave: 'global' }, cambios, { new: true });
  res.json({ config });
});

export default router;
