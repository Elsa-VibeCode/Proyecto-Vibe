import { Router } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import {
  Egreso,
  ESTADOS_RESULTADO,
  UNIDADES,
  METODOS_PAGO,
  TIPOS_IMPUESTO,
} from '../models/Egreso.js';
import { protegerRuta } from '../middleware/auth.js';
import {
  construirFiltroEgresos,
  totalesPorUnidad,
  proveedoresDistintos,
  parsearEgresosDesdeExcel,
  insertarEgresos,
} from '../services/egresoService.js';
import { invalidarPanelPorMes, invalidarPanelCompleto } from '../services/panel/invalidarPanel.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitidos = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (
      permitidos.includes(file.mimetype) ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  },
});

router.use(protegerRuta);

const validacionesEgreso = [
  body('fechaGasto').notEmpty().withMessage('La fecha del gasto es obligatoria'),
  body('estadoResultado').isIn(ESTADOS_RESULTADO).withMessage('Estado de resultado inválido'),
  body('unidad').isIn(UNIDADES).withMessage('Unidad inválida'),
  body('tipoGasto').trim().notEmpty().withMessage('El tipo de gasto es obligatorio'),
  body('proveedor').trim().notEmpty().withMessage('El proveedor es obligatorio'),
  body('concepto').trim().notEmpty().withMessage('El concepto es obligatorio'),
  body('subtotal').isFloat().withMessage('El subtotal debe ser numérico'),
  body('metodoPago').optional({ values: 'falsy' }).isIn(METODOS_PAGO).withMessage('Método de pago inválido'),
  body('tipoImpuesto').optional({ values: 'falsy' }).isIn(TIPOS_IMPUESTO).withMessage('Tipo de impuesto inválido'),
];

function revisarValidacion(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    res.status(400).json({ mensaje: errores.array()[0].msg, errores: errores.array() });
    return false;
  }
  return true;
}

// GET /api/egresos  → lista con filtros y paginación
router.get('/', async (req, res) => {
  const { pagina = 1, limite = 50, ...filtros } = req.query;
  const filtro = construirFiltroEgresos(filtros);
  const skip = (Number(pagina) - 1) * Number(limite);

  const [egresos, total] = await Promise.all([
    Egreso.find(filtro).sort({ fechaGasto: -1, createdAt: -1 }).skip(skip).limit(Number(limite)),
    Egreso.countDocuments(filtro),
  ]);

  res.json({
    egresos,
    paginacion: {
      total,
      pagina: Number(pagina),
      limite: Number(limite),
      paginas: Math.ceil(total / Number(limite)) || 1,
    },
  });
});

// GET /api/egresos/totales?mes=YYYY-MM
router.get('/totales', async (req, res) => {
  res.json(await totalesPorUnidad(req.query.mes));
});

// GET /api/egresos/proveedores → distinct para autocompletar
router.get('/proveedores', async (_req, res) => {
  res.json({ proveedores: await proveedoresDistintos() });
});

// GET /api/egresos/:id
router.get('/:id', async (req, res) => {
  const egreso = await Egreso.findById(req.params.id);
  if (!egreso) return res.status(404).json({ mensaje: 'Egreso no encontrado' });
  res.json({ egreso });
});

// POST /api/egresos
router.post('/', validacionesEgreso, async (req, res) => {
  if (!revisarValidacion(req, res)) return;
  const egreso = await Egreso.create(req.body);
  invalidarPanelPorMes(egreso.mes);
  res.status(201).json({ egreso });
});

// PUT /api/egresos/:id
router.put('/:id', validacionesEgreso, async (req, res) => {
  if (!revisarValidacion(req, res)) return;

  const egreso = await Egreso.findById(req.params.id);
  if (!egreso) return res.status(404).json({ mensaje: 'Egreso no encontrado' });

  const mesAnteriorEgreso = egreso.mes;
  const campos = [
    'fechaGasto',
    'proyecto',
    'estadoResultado',
    'unidad',
    'tipoGasto',
    'tipoSubgasto',
    'metodoPago',
    'noFactura',
    'proveedor',
    'concepto',
    'subtotal',
    'tipoImpuesto',
  ];
  for (const campo of campos) {
    if (req.body[campo] !== undefined) egreso[campo] = req.body[campo];
  }

  await egreso.save(); // recalcula impuesto/total/mes/latam vía pre-validate
  invalidarPanelPorMes(egreso.mes, mesAnteriorEgreso);
  res.json({ egreso });
});

// DELETE /api/egresos/:id
router.delete('/:id', async (req, res) => {
  const egreso = await Egreso.findByIdAndDelete(req.params.id);
  if (!egreso) return res.status(404).json({ mensaje: 'Egreso no encontrado' });
  invalidarPanelPorMes(egreso.mes);
  res.json({ mensaje: 'Egreso eliminado correctamente' });
});

// POST /api/egresos/import  → .xlsx multipart, hoja "Captura Egresos"
router.post('/import', (req, res) => {
  upload.single('archivo')(req, res, async (err) => {
    if (err) {
      const mensaje =
        err instanceof multer.MulterError
          ? 'El archivo excede el tamaño máximo permitido (10 MB)'
          : err.message;
      return res.status(400).json({ mensaje });
    }

    if (!req.file) {
      return res.status(400).json({ mensaje: 'Debes seleccionar un archivo Excel' });
    }

    try {
      const { hoja, registros, errores } = parsearEgresosDesdeExcel(req.file.buffer, {
        nombreHoja: req.body?.nombreHoja?.trim() || undefined,
      });
      const { creados, fallidos } = await insertarEgresos(registros);

      invalidarPanelCompleto();
      res.status(201).json({
        mensaje: `Importados ${creados} egresos desde la hoja "${hoja}".`,
        hoja,
        creados,
        omitidos: errores.length,
        fallidos: fallidos.length,
        detalleErrores: [...errores, ...fallidos.map((f) => ({ motivo: f.motivo }))].slice(0, 20),
      });
    } catch (error) {
      res.status(400).json({ mensaje: error.message || 'No se pudo procesar el archivo Excel' });
    }
  });
});

export default router;
