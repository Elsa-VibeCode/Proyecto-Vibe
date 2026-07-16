import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { EgresoRecurrente, FRECUENCIAS } from '../models/EgresoRecurrente.js';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import { invalidarPanelCompleto } from '../services/panel/invalidarPanel.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

router.use(protegerRuta);

const validaciones = [
  body('nombre').trim().notEmpty(),
  body('tipoGasto').trim().notEmpty(),
  body('proveedorEsperado').trim().notEmpty(),
  body('unidad').optional().trim().notEmpty(),
  body('frecuencia').optional().isIn(FRECUENCIAS),
  body('diaEsperado').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }),
  body('montoReferencia').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('tolerancia').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1 }),
  body('activo').optional().isBoolean(),
];

function failValidacion(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    res.status(400).json({ ok: false, error: errores.array()[0].msg });
    return true;
  }
  return false;
}

router.get('/', async (_req, res) => {
  const recurrentes = await EgresoRecurrente.find().sort({ nombre: 1 });
  res.json({ ok: true, data: { recurrentes } });
});

router.post('/', requiereRol(...ROLES_EDICION), validaciones, async (req, res) => {
  if (failValidacion(req, res)) return;
  const recurrente = await EgresoRecurrente.create(req.body);
  invalidarPanelCompleto();
  res.status(201).json({ ok: true, data: { recurrente } });
});

router.put('/:id', requiereRol(...ROLES_EDICION), validaciones, async (req, res) => {
  if (failValidacion(req, res)) return;
  const recurrente = await EgresoRecurrente.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!recurrente) return res.status(404).json({ ok: false, error: 'No encontrado' });
  invalidarPanelCompleto();
  res.json({ ok: true, data: { recurrente } });
});

router.patch('/:id/activo', requiereRol(...ROLES_EDICION), async (req, res) => {
  const activo = Boolean(req.body?.activo);
  const recurrente = await EgresoRecurrente.findByIdAndUpdate(req.params.id, { activo }, { new: true });
  if (!recurrente) return res.status(404).json({ ok: false, error: 'No encontrado' });
  invalidarPanelCompleto();
  res.json({ ok: true, data: { recurrente } });
});

router.delete('/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const recurrente = await EgresoRecurrente.findByIdAndDelete(req.params.id);
  if (!recurrente) return res.status(404).json({ ok: false, error: 'No encontrado' });
  invalidarPanelCompleto();
  res.json({ ok: true, data: { mensaje: 'Eliminado' } });
});

export default router;
