import { Router } from 'express';
import { Colaborador } from '../models/Colaborador.js';
import { NominaPago } from '../models/NominaPago.js';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import {
  asegurarColaboradoresDisponibles,
  sembrarColaboradores,
  upsertColaborador,
} from '../services/colaboradorSync.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

router.use(protegerRuta);

router.get('/', async (_req, res) => {
  await asegurarColaboradoresDisponibles();
  const colaboradores = await Colaborador.find().sort({ tipoRelacion: 1, nombre: 1 });
  res.json({ colaboradores });
});

router.post('/sembrar-inicial', requiereRol('admin'), async (req, res) => {
  const resultado = await sembrarColaboradores(req.usuario._id);
  res.json({
    mensaje: 'Catálogo de colaboradores sincronizado (upsert por nombre normalizado).',
    ...resultado,
  });
});

router.post('/', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const colaborador = await upsertColaborador(req.body, req.usuario._id);
    res.status(201).json({ colaborador });
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
});

router.put('/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const colaborador = await Colaborador.findById(req.params.id);
  if (!colaborador) {
    return res.status(404).json({ mensaje: 'Colaborador no encontrado' });
  }

  if (req.body.nombre) colaborador.nombre = req.body.nombre;
  if (req.body.unidadBase) colaborador.unidadBase = req.body.unidadBase;
  if (req.body.tipoRelacion) colaborador.tipoRelacion = req.body.tipoRelacion;
  if (req.body.reglasSueldo) colaborador.reglasSueldo = req.body.reglasSueldo;
  if (req.body.notas !== undefined) colaborador.notas = req.body.notas;
  colaborador.actualizadoPor = req.usuario._id;

  await colaborador.save();
  res.json({ colaborador });
});

router.delete('/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const pagos = await NominaPago.countDocuments({ colaboradorId: req.params.id });
  if (pagos > 0) {
    return res.status(409).json({
      mensaje: `No se puede eliminar: hay ${pagos} pago(s) de nómina vinculados.`,
    });
  }

  const colaborador = await Colaborador.findByIdAndDelete(req.params.id);
  if (!colaborador) {
    return res.status(404).json({ mensaje: 'Colaborador no encontrado' });
  }
  res.json({ mensaje: 'Colaborador eliminado' });
});

export default router;
