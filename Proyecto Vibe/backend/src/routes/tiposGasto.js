import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { TipoGasto } from '../models/TipoGasto.js';
import { protegerRuta } from '../middleware/auth.js';

const router = Router();

router.use(protegerRuta);

// GET /api/tipos-gasto  → lista ordenada (por defecto solo activos con ?activos=1)
router.get('/', async (req, res) => {
  const filtro = req.query.activos === '1' ? { activo: true } : {};
  const tipos = await TipoGasto.find(filtro).sort({ orden: 1, nombre: 1 });
  res.json({ tipos });
});

// POST /api/tipos-gasto
router.post(
  '/',
  [body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ mensaje: errores.array()[0].msg });
    }

    const nombre = req.body.nombre.trim().toUpperCase();
    const existe = await TipoGasto.findOne({ nombre });
    if (existe) return res.status(409).json({ mensaje: 'Ese tipo de gasto ya existe' });

    const tipo = await TipoGasto.create({
      nombre,
      activo: req.body.activo ?? true,
      orden: req.body.orden ?? 0,
    });
    res.status(201).json({ tipo });
  }
);

// PUT /api/tipos-gasto/:id
router.put('/:id', async (req, res) => {
  const tipo = await TipoGasto.findById(req.params.id);
  if (!tipo) return res.status(404).json({ mensaje: 'Tipo de gasto no encontrado' });

  if (req.body.nombre !== undefined) {
    const nombre = String(req.body.nombre).trim().toUpperCase();
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    const existe = await TipoGasto.findOne({ nombre, _id: { $ne: tipo._id } });
    if (existe) return res.status(409).json({ mensaje: 'Ese tipo de gasto ya existe' });
    tipo.nombre = nombre;
  }
  if (req.body.activo !== undefined) tipo.activo = req.body.activo;
  if (req.body.orden !== undefined) tipo.orden = req.body.orden;

  await tipo.save();
  res.json({ tipo });
});

// DELETE /api/tipos-gasto/:id
router.delete('/:id', async (req, res) => {
  const tipo = await TipoGasto.findByIdAndDelete(req.params.id);
  if (!tipo) return res.status(404).json({ mensaje: 'Tipo de gasto no encontrado' });
  res.json({ mensaje: 'Tipo de gasto eliminado correctamente' });
});

export default router;
