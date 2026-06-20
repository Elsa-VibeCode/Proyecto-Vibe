import { Router } from 'express';
import multer from 'multer';
import { ExcelImport } from '../models/ExcelImport.js';
import { protegerRuta } from '../middleware/auth.js';
import { parsearExcel, generarExcel } from '../utils/excel.js';
import {
  detectarColumnas,
  filtrarFilas,
  calcularResumenNiveles,
} from '../utils/excelFiltros.js';

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

router.get('/', async (req, res) => {
  const importaciones = await ExcelImport.find({ subidoPor: req.usuario._id })
    .select('nombreArchivo nombreHoja columnas totalFilas createdAt')
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({ importaciones });
});

router.post('/importar', (req, res) => {
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
      const { nombreHoja, columnas, filas, totalFilas } = parsearExcel(req.file.buffer);

      const importacion = await ExcelImport.create({
        nombreArchivo: req.file.originalname,
        nombreHoja,
        columnas,
        filas,
        totalFilas,
        subidoPor: req.usuario._id,
      });

      res.status(201).json({
        mensaje: 'Archivo importado correctamente',
        importacion: {
          id: importacion._id,
          nombreArchivo: importacion.nombreArchivo,
          nombreHoja: importacion.nombreHoja,
          columnas: importacion.columnas,
          filas: importacion.filas,
          totalFilas: importacion.totalFilas,
          createdAt: importacion.createdAt,
        },
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message || 'No se pudo procesar el archivo Excel',
      });
    }
  });
});

router.get('/:id/resumen-rh', async (req, res) => {
  const importacion = await ExcelImport.findOne({
    _id: req.params.id,
    subidoPor: req.usuario._id,
  });

  if (!importacion) {
    return res.status(404).json({ mensaje: 'Importación no encontrada' });
  }

  const mapeo = detectarColumnas(importacion.columnas);
  const filtros = req.query;
  const filasFiltradas = filtrarFilas(importacion.filas, mapeo, filtros);
  const resumenNiveles = calcularResumenNiveles(filasFiltradas, mapeo);

  const conSeguro = filasFiltradas.filter((f) => {
    const valor = mapeo.seguroMedico ? f[mapeo.seguroMedico] : null;
    return ['si', 'sí', 'yes', 'true', '1', 'activo', 'incluido', 'con seguro'].includes(
      String(valor ?? '').toLowerCase().trim()
    );
  }).length;

  res.json({
    mapeo,
    totalFilas: filasFiltradas.length,
    resumenNiveles,
    seguroMedico: {
      conSeguro,
      sinSeguro: filasFiltradas.length - conSeguro,
      porcentaje: filasFiltradas.length
        ? Math.round((conSeguro / filasFiltradas.length) * 100)
        : 0,
    },
  });
});

router.post('/:id/exportar-filtrado', async (req, res) => {
  const importacion = await ExcelImport.findOne({
    _id: req.params.id,
    subidoPor: req.usuario._id,
  });

  if (!importacion) {
    return res.status(404).json({ mensaje: 'Importación no encontrada' });
  }

  const mapeo = detectarColumnas(importacion.columnas);
  const filas = filtrarFilas(importacion.filas, mapeo, req.body?.filtros ?? {});

  const buffer = generarExcel({
    nombreHoja: importacion.nombreHoja,
    columnas: importacion.columnas,
    filas,
  });

  const nombre = importacion.nombreArchivo.replace(/\.(xlsx|xls)$/i, '') || 'datos';

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}-filtrado.xlsx"`);
  res.send(buffer);
});

router.get('/:id/exportar', async (req, res) => {
  const importacion = await ExcelImport.findOne({
    _id: req.params.id,
    subidoPor: req.usuario._id,
  });

  if (!importacion) {
    return res.status(404).json({ mensaje: 'Importación no encontrada' });
  }

  const buffer = generarExcel({
    nombreHoja: importacion.nombreHoja,
    columnas: importacion.columnas,
    filas: importacion.filas,
  });

  const nombre = importacion.nombreArchivo.replace(/\.(xlsx|xls)$/i, '') || 'datos';

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}-exportado.xlsx"`);
  res.send(buffer);
});

router.get('/:id', async (req, res) => {
  const importacion = await ExcelImport.findOne({
    _id: req.params.id,
    subidoPor: req.usuario._id,
  });

  if (!importacion) {
    return res.status(404).json({ mensaje: 'Importación no encontrada' });
  }

  res.json({ importacion });
});

export default router;
