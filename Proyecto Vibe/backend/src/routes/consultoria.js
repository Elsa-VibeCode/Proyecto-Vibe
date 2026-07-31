import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import {
  listarConsultores,
  listarClientes,
  crearCliente,
  actualizarCliente,
  listarPropuestas,
  obtenerPropuesta,
  crearPropuesta,
  actualizarPropuesta,
  eliminarPropuesta,
  cambiarStatusPropuesta,
  resumenPropuestas,
  seedPropuestasEnero2025,
  listarProyectos,
  obtenerProyecto,
  crearProyecto,
  actualizarProyecto,
  eliminarProyecto,
  cambiarStatusProyecto,
  agregarNotaProyecto,
  resumenProyectos,
  seedProyectosOperacion,
  UBICACIONES_CONSULTORIA,
  TIPOS_CLIENTE,
  PROCESOS_PROPUESTA,
  STATUS_PROPUESTA,
  STATUS_PROYECTO,
  TIPOS_PROYECTO,
  ROLES_PROYECTO,
} from '../services/consultoriaService.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ ok: false, error });

function revisarValidacion(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    fail(res, errores.array()[0].msg, 400);
    return false;
  }
  return true;
}

router.use(protegerRuta);
router.use(requiereRol(...ROLES_EDICION));

router.get('/meta', (_req, res) => {
  ok(res, {
    modulo: 'consultoria',
    nombre: 'Consultoría (BWConsulting)',
    etapa: 4,
    enums: {
      ubicaciones: UBICACIONES_CONSULTORIA,
      tiposCliente: TIPOS_CLIENTE,
      procesos: PROCESOS_PROPUESTA,
      statusPropuesta: STATUS_PROPUESTA,
      rolesProyecto: ROLES_PROYECTO,
      tiposProyecto: TIPOS_PROYECTO,
      statusProyecto: STATUS_PROYECTO,
    },
  });
});

// Consultores (Honorarios)
router.get('/consultores', async (req, res) => {
  try {
    ok(res, await listarConsultores(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// Clientes
router.get('/clientes', async (req, res) => {
  try {
    ok(res, await listarClientes(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.post(
  '/clientes',
  body('nombre').trim().notEmpty().withMessage('nombre es obligatorio'),
  async (req, res) => {
    if (!revisarValidacion(req, res)) return;
    try {
      ok(res, await crearCliente(req.body, req.usuario), 201);
    } catch (err) {
      fail(res, err.message, 400);
    }
  }
);

router.patch('/clientes/:id', async (req, res) => {
  try {
    const doc = await actualizarCliente(req.params.id, req.body, req.usuario);
    if (!doc) return fail(res, 'Cliente no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Propuestas
router.get('/propuestas', async (req, res) => {
  try {
    ok(res, await listarPropuestas(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/propuestas/resumen', async (req, res) => {
  try {
    ok(res, await resumenPropuestas(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/propuestas/:id', async (req, res) => {
  try {
    const doc = await obtenerPropuesta(req.params.id);
    if (!doc) return fail(res, 'Propuesta no encontrada', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.post(
  '/propuestas',
  body('anio').isInt({ min: 2020 }).withMessage('año inválido'),
  body('mes').isInt({ min: 1, max: 12 }).withMessage('mes inválido'),
  body('ubicacion').notEmpty().withMessage('ubicación es obligatoria'),
  body('liderId').notEmpty().withMessage('liderId es obligatorio'),
  body('clienteId').notEmpty().withMessage('clienteId es obligatorio'),
  body('proceso').notEmpty().withMessage('proceso es obligatorio'),
  async (req, res) => {
    if (!revisarValidacion(req, res)) return;
    try {
      ok(res, await crearPropuesta(req.body, req.usuario), 201);
    } catch (err) {
      fail(res, err.message, 400);
    }
  }
);

router.put('/propuestas/:id', async (req, res) => {
  try {
    const doc = await actualizarPropuesta(req.params.id, req.body, req.usuario);
    if (!doc) return fail(res, 'Propuesta no encontrada', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.patch('/propuestas/:id/status', async (req, res) => {
  try {
    const doc = await cambiarStatusPropuesta(req.params.id, req.body.status, req.usuario);
    if (!doc) return fail(res, 'Propuesta no encontrada', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.delete('/propuestas/:id', async (req, res) => {
  try {
    const doc = await eliminarPropuesta(req.params.id, req.usuario);
    if (!doc) return fail(res, 'Propuesta no encontrada', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Proyectos
router.get('/proyectos', async (req, res) => {
  try {
    ok(res, await listarProyectos(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/proyectos/resumen', async (req, res) => {
  try {
    ok(res, await resumenProyectos(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/proyectos/:id', async (req, res) => {
  try {
    const doc = await obtenerProyecto(req.params.id);
    if (!doc) return fail(res, 'Proyecto no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.post(
  '/proyectos',
  body('consultorId').notEmpty().withMessage('consultorId es obligatorio'),
  body('clienteId').notEmpty().withMessage('clienteId es obligatorio'),
  body('descripcion').trim().notEmpty().withMessage('descripción es obligatoria'),
  async (req, res) => {
    if (!revisarValidacion(req, res)) return;
    try {
      ok(res, await crearProyecto(req.body, req.usuario), 201);
    } catch (err) {
      fail(res, err.message, 400);
    }
  }
);

router.put('/proyectos/:id', async (req, res) => {
  try {
    const doc = await actualizarProyecto(req.params.id, req.body, req.usuario);
    if (!doc) return fail(res, 'Proyecto no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.patch('/proyectos/:id/status', async (req, res) => {
  try {
    const doc = await cambiarStatusProyecto(req.params.id, req.body.status, req.usuario);
    if (!doc) return fail(res, 'Proyecto no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.post('/proyectos/:id/notas', async (req, res) => {
  try {
    const doc = await agregarNotaProyecto(req.params.id, req.body.nota, req.usuario);
    if (!doc) return fail(res, 'Proyecto no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.delete('/proyectos/:id', async (req, res) => {
  try {
    const doc = await eliminarProyecto(req.params.id, req.usuario);
    if (!doc) return fail(res, 'Proyecto no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Seed admin-only
router.post('/seed/propuestas-enero-2025', async (req, res) => {
  if (req.usuario?.rol !== 'admin') {
    return fail(res, 'Solo admin puede ejecutar seed', 403);
  }
  try {
    ok(res, await seedPropuestasEnero2025(req.usuario));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.post('/seed/proyectos-operacion', async (req, res) => {
  if (req.usuario?.rol !== 'admin') {
    return fail(res, 'Solo admin puede ejecutar seed', 403);
  }
  try {
    ok(res, await seedProyectosOperacion(req.usuario));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

export default router;
