import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { Factura } from '../models/Factura.js';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import {
  construirFiltroFacturas,
  totalesFacturas,
  clientesDistintos,
  clasificarFactura,
  migrarFacturasDesdeExcel,
  mesesFacturacionDisponibles,
  mesesPagoDisponibles,
  folioDisponible,
  historialCliente,
  conceptosDeCliente,
  softDeleteFactura,
  prepararDatosFactura,
  validarReglasFactura,
  registrarHistorialFactura,
  diffFactura,
  FILTRO_ACTIVAS,
} from '../services/facturaService.js';

const router = Router();

const ROLES_EDICION = ['admin', 'editor'];

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ ok: false, error });

router.use(protegerRuta);

// GET /api/facturas → lista con filtros + paginación
router.get('/', async (req, res) => {
  const { pagina = 1, limite = 50, ...filtros } = req.query;
  const filtro = construirFiltroFacturas(filtros);
  const skip = (Number(pagina) - 1) * Number(limite);

  const [facturas, total] = await Promise.all([
    Factura.find(filtro).sort({ fechaFacturacion: -1, createdAt: -1 }).skip(skip).limit(Number(limite)),
    Factura.countDocuments(filtro),
  ]);

  ok(res, {
    facturas,
    paginacion: {
      total,
      pagina: Number(pagina),
      limite: Number(limite),
      paginas: Math.ceil(total / Number(limite)) || 1,
    },
  });
});

router.get('/totales', async (req, res) => {
  ok(res, await totalesFacturas(req.query));
});

router.get('/meses-facturacion', async (_req, res) => {
  ok(res, { meses: await mesesFacturacionDisponibles() });
});

router.get('/meses-pago', async (_req, res) => {
  ok(res, { meses: await mesesPagoDisponibles() });
});

router.get('/clientes', async (_req, res) => {
  ok(res, { clientes: await clientesDistintos() });
});

router.get('/check-folio', async (req, res) => {
  const noFactura = String(req.query.noFactura ?? '').trim();
  if (!noFactura) return fail(res, 'Indique el número de factura');
  const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
  const disponible = await folioDisponible(noFactura, excludeId);
  ok(res, { noFactura, disponible });
});

router.get('/cliente-historial', async (req, res) => {
  const cliente = String(req.query.cliente ?? '').trim();
  if (!cliente) return fail(res, 'Indique el cliente');
  const historial = await historialCliente(cliente);
  if (!historial) return fail(res, 'Cliente no indicado');
  ok(res, historial);
});

router.get('/conceptos', async (req, res) => {
  const cliente = String(req.query.cliente ?? '').trim();
  if (!cliente) return fail(res, 'Indique el cliente');
  ok(res, { conceptos: await conceptosDeCliente(cliente) });
});

router.post('/migrar', requiereRol('admin'), async (req, res) => {
  const dryRun = req.query.dryRun === '1' || req.body?.dryRun === true;
  const resumen = await migrarFacturasDesdeExcel({ dryRun });
  if (!resumen.ok) return fail(res, resumen.error, 404);
  ok(res, resumen);
});

router.patch('/:id/clasificar', requiereRol(...ROLES_EDICION), async (req, res) => {
  const unidad = String(req.body?.unidad ?? '').trim();
  if (!unidad) return fail(res, 'Indique la unidad (Consulting, Technologies o Grupo)');

  try {
    const factura = await clasificarFactura(req.params.id, unidad);
    if (!factura) return fail(res, 'Factura no encontrada', 404);
    ok(res, { factura });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : 'No se pudo clasificar', 400);
  }
});

router.get('/:id', async (req, res) => {
  const factura = await Factura.findOne({ _id: req.params.id, ...FILTRO_ACTIVAS });
  if (!factura) return fail(res, 'Factura no encontrada', 404);
  ok(res, { factura });
});

const validaciones = [
  body('fechaFacturacion').notEmpty().withMessage('La fecha de facturación es obligatoria'),
  body('noFactura').trim().notEmpty().withMessage('El número de factura es obligatorio'),
  body('cliente').trim().notEmpty().withMessage('El cliente es obligatorio'),
  body('concepto').trim().notEmpty().withMessage('El concepto es obligatorio'),
  body('unidad').trim().notEmpty().withMessage('La unidad de negocio es obligatoria'),
  body('subtotal').isFloat({ gt: 0 }).withMessage('El subtotal debe ser mayor a 0'),
];

function primerError(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    fail(res, errores.array()[0].msg);
    return true;
  }
  return false;
}

router.post('/', requiereRol(...ROLES_EDICION), validaciones, async (req, res) => {
  if (primerError(req, res)) return;

  try {
    const datos = await prepararDatosFactura(req.body);
    validarReglasFactura(datos);

    const disponible = await folioDisponible(datos.noFactura);
    if (!disponible) return fail(res, 'Ya existe una factura con ese número', 409);

    datos.origen = 'manual';
    const factura = await Factura.create(datos);
    await registrarHistorialFactura(
      factura._id,
      'crear',
      CAMPOS_CREACION(datos),
      req.usuario?._id
    );
    ok(res, { factura }, 201);
  } catch (err) {
    fail(res, err instanceof Error ? err.message : 'No se pudo crear la factura', 400);
  }
});

router.put('/:id', requiereRol(...ROLES_EDICION), validaciones, async (req, res) => {
  if (primerError(req, res)) return;

  const factura = await Factura.findOne({ _id: req.params.id, ...FILTRO_ACTIVAS });
  if (!factura) return fail(res, 'Factura no encontrada', 404);

  try {
    if (req.body.noFactura && req.body.noFactura.trim() !== factura.noFactura) {
      const disponible = await folioDisponible(req.body.noFactura.trim(), factura._id);
      if (!disponible) return fail(res, 'Ya existe una factura con ese número', 409);
    }

    const antes = factura.toObject();
    const datos = await prepararDatosFactura(req.body);
    validarReglasFactura(datos);

    const campos = [
      'fechaFacturacion', 'fechaPago', 'noFactura', 'cliente', 'concepto', 'unidad',
      'subtotal', 'iva', 'total', 'estatusEnvio', 'estatusPago', 'complementoPago',
      'rfcEmisor', 'clasificacionAuto', 'unidadManual',
    ];
    for (const campo of campos) {
      if (datos[campo] !== undefined) factura[campo] = datos[campo];
    }
    await factura.save();

    const cambios = diffFactura(antes, factura.toObject());
    await registrarHistorialFactura(factura._id, 'actualizar', cambios, req.usuario?._id);

    ok(res, { factura });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : 'No se pudo actualizar la factura', 400);
  }
});

router.delete('/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const factura = await softDeleteFactura(req.params.id);
  if (!factura) return fail(res, 'Factura no encontrada', 404);

  await registrarHistorialFactura(
    factura._id,
    'eliminar',
    [{ campo: 'deletedAt', anterior: null, nuevo: factura.deletedAt?.toISOString() ?? null }],
    req.usuario?._id
  );

  ok(res, { mensaje: 'Factura eliminada correctamente', factura });
});

function CAMPOS_CREACION(datos) {
  return Object.entries(datos)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([campo, nuevo]) => ({ campo, anterior: null, nuevo }));
}

export default router;
