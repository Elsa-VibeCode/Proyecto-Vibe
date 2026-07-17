import { Router } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import { ComplementoPago, FORMAS_PAGO_SAT, MONEDAS_COMPLEMENTO, UNIDADES_COMPLEMENTO } from '../models/ComplementoPago.js';
import {
  crearComplemento,
  actualizarComplemento,
  eliminarComplemento,
  listarComplementos,
  sugerirSiguienteFolio,
  facturasPpdDisponibles,
} from '../services/complementoPagoService.js';
import {
  construirPreviewRep,
  importarRepSicofi,
} from '../services/sicofiRepImportService.js';
import { invalidarPanelCompleto } from '../services/panel/invalidarPanel.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

const uploadSicofi = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

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

router.get('/', async (req, res) => {
  try {
    ok(res, await listarComplementos(req.query));
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/sugerir-folio', async (_req, res) => {
  try {
    ok(res, { folio: await sugerirSiguienteFolio() });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/facturas-disponibles', async (req, res) => {
  try {
    const { cliente, facturaId } = req.query;
    ok(res, {
      facturas: await facturasPpdDisponibles(cliente, facturaId),
    });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

router.get('/:id', async (req, res) => {
  const complemento = await ComplementoPago.findById(req.params.id);
  if (!complemento) return fail(res, 'Complemento no encontrado', 404);
  ok(res, { complemento });
});

const validaciones = [
  body('folio').trim().notEmpty().withMessage('El folio es obligatorio'),
  body('fechaEmision').notEmpty().withMessage('La fecha de emisión es obligatoria'),
  body('fechaPago').notEmpty().withMessage('La fecha de pago es obligatoria'),
  body('monto').isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a cero'),
  body('moneda').optional().isIn(MONEDAS_COMPLEMENTO),
  body('formaPago').optional().isIn(FORMAS_PAGO_SAT),
  body('unidad').optional().isIn(UNIDADES_COMPLEMENTO),
  body('facturasRelacionadas').isArray({ min: 1 }).withMessage('Incluye al menos una factura'),
];

router.post('/', requiereRol(...ROLES_EDICION), validaciones, async (req, res) => {
  if (!revisarValidacion(req, res)) return;
  try {
    const complemento = await crearComplemento(req.body, req.clerkUserId);
    invalidarPanelCompleto();
    ok(res, { complemento }, 201);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.patch('/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const complemento = await actualizarComplemento(req.params.id, req.body);
    if (!complemento) return fail(res, 'Complemento no encontrado', 404);
    invalidarPanelCompleto();
    ok(res, { complemento });
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.delete('/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const complemento = await eliminarComplemento(req.params.id);
    if (!complemento) return fail(res, 'Complemento no encontrado', 404);
    invalidarPanelCompleto();
    ok(res, { complemento });
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.post('/preview-sicofi', requiereRol(...ROLES_EDICION), uploadSicofi.single('archivo'), async (req, res) => {
  try {
    if (!req.file?.buffer) return fail(res, 'Archivo requerido');
    ok(res, await construirPreviewRep(req.file.buffer, req.file.originalname));
  } catch (err) {
    fail(res, err.message, 400);
  }
});

router.post('/import-sicofi', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const resultado = await importarRepSicofi(req.body, req.clerkUserId);
    invalidarPanelCompleto();
    ok(res, resultado);
  } catch (err) {
    fail(res, err.message, 400);
  }
});

export default router;
