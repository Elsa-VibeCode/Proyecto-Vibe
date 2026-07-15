import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { Factura } from '../models/Factura.js';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import {
  construirFiltroFacturas,
  totalesFacturas,
  clientesDistintos,
  construirIndiceMapa,
  clasificarPorCliente,
  clasificarFactura,
  calcularIva,
  migrarFacturasDesdeExcel,
  mesesFacturacionDisponibles,
  mesesPagoDisponibles,
} from '../services/facturaService.js';

const router = Router();

const ROLES_EDICION = ['admin', 'editor'];

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ ok: false, error });

router.use(protegerRuta);

const redondear = (v) => Math.round((Number(v) || 0) * 100) / 100;

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

// GET /api/facturas/totales — acepta los mismos filtros que el listado
router.get('/totales', async (req, res) => {
  ok(res, await totalesFacturas(req.query));
});

// GET /api/facturas/meses-facturacion
router.get('/meses-facturacion', async (_req, res) => {
  ok(res, { meses: await mesesFacturacionDisponibles() });
});

// GET /api/facturas/meses-pago
router.get('/meses-pago', async (_req, res) => {
  ok(res, { meses: await mesesPagoDisponibles() });
});

// GET /api/facturas/clientes → distinct (facturas + mapa) para autocompletar
router.get('/clientes', async (_req, res) => {
  ok(res, { clientes: await clientesDistintos() });
});

// POST /api/facturas/migrar → migra desde la última importación de facturación (admin)
// ?dryRun=1 para solo obtener el resumen sin escribir.
router.post('/migrar', requiereRol('admin'), async (req, res) => {
  const dryRun = req.query.dryRun === '1' || req.body?.dryRun === true;
  const resumen = await migrarFacturasDesdeExcel({ dryRun });
  if (!resumen.ok) return fail(res, resumen.error, 404);
  ok(res, resumen);
});

// PATCH /api/facturas/:id/clasificar → unidad por factura (ej. ENLAC con distintas unidades)
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

// GET /api/facturas/:id
router.get('/:id', async (req, res) => {
  const factura = await Factura.findById(req.params.id);
  if (!factura) return fail(res, 'Factura no encontrada', 404);
  ok(res, { factura });
});

const validaciones = [
  body('fechaFacturacion').notEmpty().withMessage('La fecha de facturación es obligatoria'),
  body('noFactura').trim().notEmpty().withMessage('El número de factura es obligatorio'),
  body('cliente').trim().notEmpty().withMessage('El cliente es obligatorio'),
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

// Asigna unidad/clasificación e iva/total coherentes a partir del body.
async function prepararFactura(body) {
  const datos = { ...body };
  const subtotal = Number(datos.subtotal) || 0;

  // IVA/total: usa lo enviado o autocalcula (NOVAMEX → IVA 0).
  const iva = datos.iva !== undefined && datos.iva !== '' ? Number(datos.iva) : calcularIva(subtotal, datos.cliente);
  datos.iva = redondear(iva);
  datos.subtotal = redondear(subtotal);
  datos.total = datos.total !== undefined && datos.total !== '' ? redondear(datos.total) : redondear(subtotal + datos.iva);

  // Clasificación: si no se envía unidad, autoclasifica por cliente.
  if (datos.unidad === undefined || datos.unidad === '' || datos.unidad === null) {
    const indice = await construirIndiceMapa();
    const { unidad, clasificacionAuto } = clasificarPorCliente(datos.cliente, indice);
    datos.unidad = unidad;
    datos.clasificacionAuto = clasificacionAuto;
  } else {
    datos.clasificacionAuto = false;
    datos.unidadManual = true;
  }

  return datos;
}

// POST /api/facturas
router.post('/', validaciones, async (req, res) => {
  if (primerError(req, res)) return;

  const existe = await Factura.findOne({ noFactura: req.body.noFactura.trim() });
  if (existe) return fail(res, 'Ya existe una factura con ese número', 409);

  const datos = await prepararFactura(req.body);
  datos.origen = 'manual';
  const factura = await Factura.create(datos);
  ok(res, { factura }, 201);
});

// PUT /api/facturas/:id
router.put('/:id', validaciones, async (req, res) => {
  if (primerError(req, res)) return;

  const factura = await Factura.findById(req.params.id);
  if (!factura) return fail(res, 'Factura no encontrada', 404);

  if (req.body.noFactura && req.body.noFactura.trim() !== factura.noFactura) {
    const existe = await Factura.findOne({ noFactura: req.body.noFactura.trim(), _id: { $ne: factura._id } });
    if (existe) return fail(res, 'Ya existe una factura con ese número', 409);
  }

  const datos = await prepararFactura(req.body);
  const campos = [
    'fechaFacturacion', 'fechaPago', 'noFactura', 'cliente', 'concepto', 'unidad',
    'subtotal', 'iva', 'total', 'estatusEnvio', 'estatusPago', 'complementoPago',
    'rfcEmisor', 'clasificacionAuto', 'unidadManual',
  ];
  for (const campo of campos) {
    if (datos[campo] !== undefined) factura[campo] = datos[campo];
  }
  await factura.save();
  ok(res, { factura });
});

// DELETE /api/facturas/:id
router.delete('/:id', async (req, res) => {
  const factura = await Factura.findByIdAndDelete(req.params.id);
  if (!factura) return fail(res, 'Factura no encontrada', 404);
  ok(res, { mensaje: 'Factura eliminada correctamente' });
});

export default router;
