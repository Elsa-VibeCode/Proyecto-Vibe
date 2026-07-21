import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import {
  listarConsultores,
  crearConsultor,
  actualizarConsultor,
  listarProyectos,
  crearProyecto,
  actualizarProyecto,
  listarPresets,
  crearPreset,
  listarDistribuciones,
  obtenerOCrearBorrador,
  upsertDistribucion,
  eliminarDistribucion,
  previewCalculo,
  reporteMensual,
  reporteConsultor,
  reporteIngresos,
  exportarMensualXlsx,
  defaultsPorPeriodo,
  ROLES_HONORARIO,
} from '../services/honorariosService.js';

const router = Router();
/** Solo admin por ahora (decisión de producto). */
const ROLES_EDICION = ['admin'];

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
    roles: ROLES_HONORARIO,
    defaultsJunio2026: defaultsPorPeriodo('2026-06'),
    defaultsPreJunio: defaultsPorPeriodo('2026-05'),
  });
});

// Consultores
router.get('/consultants', async (req, res) => {
  try {
    ok(res, await listarConsultores(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.post(
  '/consultants',
  body('nombre').trim().notEmpty().withMessage('nombre es obligatorio'),
  async (req, res) => {
    if (!revisarValidacion(req, res)) return;
    try {
      ok(res, await crearConsultor(req.body), 201);
    } catch (err) {
      fail(res, err.message, 400);
    }
  }
);

router.patch('/consultants/:id', async (req, res) => {
  try {
    const doc = await actualizarConsultor(req.params.id, req.body);
    if (!doc) return fail(res, 'Consultor no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Proyectos
router.get('/projects', async (req, res) => {
  try {
    ok(res, await listarProyectos(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.post(
  '/projects',
  body('nombre').trim().notEmpty().withMessage('nombre es obligatorio'),
  async (req, res) => {
    if (!revisarValidacion(req, res)) return;
    try {
      ok(res, await crearProyecto(req.body), 201);
    } catch (err) {
      fail(res, err.message, 400);
    }
  }
);

router.patch('/projects/:id', async (req, res) => {
  try {
    const doc = await actualizarProyecto(req.params.id, req.body);
    if (!doc) return fail(res, 'Proyecto no encontrado', 404);
    ok(res, doc);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Presets
router.get('/presets', async (_req, res) => {
  try {
    ok(res, await listarPresets());
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.post('/presets', async (req, res) => {
  try {
    ok(res, await crearPreset(req.body), 201);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Distribuciones
router.get('/monthly-distributions', async (req, res) => {
  try {
    ok(res, await listarDistribuciones(req.query));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.get('/monthly-distributions/borrador', async (req, res) => {
  try {
    const { projectId, periodo } = req.query;
    if (!projectId || !periodo) return fail(res, 'projectId y periodo son obligatorios');
    ok(res, await obtenerOCrearBorrador(projectId, periodo));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.post('/monthly-distributions/preview', async (req, res) => {
  try {
    ok(res, await previewCalculo(req.body));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.put('/monthly-distributions', async (req, res) => {
  try {
    ok(res, await upsertDistribucion(req.body, req.clerkUserId));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.delete('/monthly-distributions/:id', async (req, res) => {
  try {
    const doc = await eliminarDistribucion(req.params.id);
    if (!doc) return fail(res, 'Distribución no encontrada', 404);
    ok(res, { eliminado: true });
  } catch (err) {
    fail(res, err.message, 400);
  }
});

// Reportes
router.get('/reports/monthly/:periodo', async (req, res) => {
  try {
    ok(res, await reporteMensual(req.params.periodo));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.get('/reports/consultant/:id', async (req, res) => {
  try {
    ok(res, await reporteConsultor(req.params.id, req.query));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.get('/reports/income', async (req, res) => {
  try {
    ok(res, await reporteIngresos(req.query));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.get('/exports/monthly/:periodo.xlsx', async (req, res) => {
  try {
    const buffer = await exportarMensualXlsx(req.params.periodo);
    const periodo = req.params.periodo;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="honorarios-${periodo}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

export default router;
