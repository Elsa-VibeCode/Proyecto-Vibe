import { Router } from 'express';
import multer from 'multer';
import { ExcelImport } from '../models/ExcelImport.js';
import { protegerRuta } from '../middleware/auth.js';
import { parsearExcel, generarExcel, previsualizarLibro } from '../utils/excel.js';
import { MapaUnidad } from '../models/MapaUnidad.js';
import {
  asegurarMapaUnidadesDisponible,
  sincronizarMapaUnidadesDesdeFilas,
} from '../services/mapaSync.js';
import {
  enriquecerFilasFacturacion,
  resumenClasificacionFacturacion,
} from '../utils/clasificacionMotor.js';
import {
  detectarColumnas,
  detectarTipoHoja,
  filtrarFilas,
  calcularResumenNiveles,
  calcularResumenUnidades,
  calcularResumenFacturacion,
  calcularResumenFinanzas,
  calcularResumenEstadoCuenta,
  calcularResumenConciliacion,
  calcularResumenAportacionesGrupo,
  crearMapaColaboradoresUnidad,
  clasificarFilasEstadoCuenta,
  agruparImportacionesConciliacion,
  buscarImportacionConciliacion,
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

const TIPOS_VALIDOS = [
  'facturacion',
  'resumen-mensual',
  'estado-cuenta',
  'estado-cuenta-flujo',
  'conciliacion',
  'aportaciones-grupo',
  'sueldos-unidad',
  'mapa-unidades',
  'rrhh',
  'generico',
];

router.use(protegerRuta);

async function obtenerMapaColaboradoresUnidad(usuarioId) {
  const importacionSueldos = await ExcelImport.findOne({
    subidoPor: usuarioId,
    tipoHoja: 'sueldos-unidad',
  })
    .sort({ createdAt: -1 })
    .select('columnas filas');

  if (!importacionSueldos) return [];

  const mapeoSueldos = detectarColumnas(importacionSueldos.columnas);
  return crearMapaColaboradoresUnidad(importacionSueldos.filas, mapeoSueldos);
}

async function obtenerMapaUnidades() {
  await asegurarMapaUnidadesDisponible();
  return MapaUnidad.find().lean();
}

async function aplicarClasificacionFacturacion(filas, mapeo) {
  const mapaUnidades = await obtenerMapaUnidades();
  const filasEnriquecidas = enriquecerFilasFacturacion(filas, mapeo, mapaUnidades);
  return {
    filas: filasEnriquecidas,
    resumenClasificacion: resumenClasificacionFacturacion(filasEnriquecidas),
    mapaCargado: mapaUnidades.length > 0,
  };
}

async function construirResumen(importacion, filtros = {}, usuarioId = null) {
  const mapeo = detectarColumnas(importacion.columnas);
  const tipoHoja =
    importacion.tipoHoja ||
    detectarTipoHoja(mapeo, importacion.columnas, importacion.nombreHoja);

  let filasBase = importacion.filas;
  let infoClasificacion = { reclasificados: 0, usaMapaSueldos: false };
  let infoFacturacionClasificacion = null;

  if (tipoHoja === 'facturacion') {
    const resultado = await aplicarClasificacionFacturacion(filasBase, mapeo);
    filasBase = resultado.filas;
    infoFacturacionClasificacion = {
      resumen: resultado.resumenClasificacion,
      mapaCargado: resultado.mapaCargado,
    };
  }

  if (
    usuarioId &&
    (tipoHoja === 'estado-cuenta' || tipoHoja === 'estado-cuenta-flujo')
  ) {
    const mapaColaboradores = await obtenerMapaColaboradoresUnidad(usuarioId);
    const resultado = clasificarFilasEstadoCuenta(filasBase, mapeo, mapaColaboradores);
    filasBase = resultado.filas;
    infoClasificacion = {
      reclasificados: resultado.reclasificados,
      usaMapaSueldos: mapaColaboradores.length > 0,
    };
  }

  const filasFiltradas = filtrarFilas(filasBase, mapeo, filtros);

  const resumen = {
    mapeo,
    tipoHoja,
    totalFilas: filasFiltradas.length,
    importacion: {
      id: importacion._id,
      nombreArchivo: importacion.nombreArchivo,
      nombreHoja: importacion.nombreHoja,
      totalFilas: importacion.totalFilas,
      createdAt: importacion.createdAt,
    },
  };

  if (tipoHoja === 'facturacion') {
    resumen.facturacion = calcularResumenFacturacion(filasFiltradas, mapeo);
    resumen.clasificacionFacturacion = infoFacturacionClasificacion;
    resumen.filas = filasFiltradas;
  } else if (tipoHoja === 'resumen-mensual') {
    resumen.finanzas = calcularResumenFinanzas(filasFiltradas, importacion.columnas);
    resumen.aportacionesGrupo = calcularResumenAportacionesGrupo(
      filasFiltradas,
      importacion.columnas,
      importacion.nombreHoja
    );
    resumen.filas = filasFiltradas;
  } else if (tipoHoja === 'aportaciones-grupo') {
    resumen.aportacionesGrupo = calcularResumenAportacionesGrupo(
      filasFiltradas,
      importacion.columnas,
      importacion.nombreHoja
    );
    resumen.filas = filasFiltradas;
  } else if (tipoHoja === 'estado-cuenta' || tipoHoja === 'estado-cuenta-flujo') {
    resumen.estadoCuenta = calcularResumenEstadoCuenta(
      filasFiltradas,
      mapeo,
      tipoHoja === 'estado-cuenta-flujo',
      infoClasificacion
    );
    resumen.filas = filasFiltradas;
  } else if (tipoHoja === 'conciliacion') {
    resumen.conciliacion = calcularResumenConciliacion(
      filasFiltradas,
      mapeo,
      importacion.datosEstructurados
    );
    resumen.filas = filasFiltradas;
  } else {
    resumen.resumenNiveles = calcularResumenNiveles(filasFiltradas, mapeo);
    resumen.resumenUnidades = calcularResumenUnidades(filasFiltradas, mapeo);
    resumen.filas = filasFiltradas;

    const conSeguro = filasFiltradas.filter((f) => {
      const valor = mapeo.seguroMedico ? f[mapeo.seguroMedico] : null;
      return ['si', 'sí', 'yes', 'true', '1', 'activo', 'incluido', 'con seguro'].includes(
        String(valor ?? '').toLowerCase().trim()
      );
    }).length;

    resumen.seguroMedico = {
      conSeguro,
      sinSeguro: filasFiltradas.length - conSeguro,
      porcentaje: filasFiltradas.length
        ? Math.round((conSeguro / filasFiltradas.length) * 100)
        : 0,
    };
  }

  return resumen;
}

router.get('/', async (req, res) => {
  const importaciones = await ExcelImport.find({ subidoPor: req.usuario._id })
    .select('nombreArchivo nombreHoja columnas totalFilas tipoHoja createdAt')
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({ importaciones });
});

router.get('/conciliaciones', async (req, res) => {
  const importaciones = await ExcelImport.find({
    subidoPor: req.usuario._id,
    tipoHoja: 'conciliacion',
  })
    .select('nombreArchivo nombreHoja totalFilas tipoHoja datosEstructurados createdAt')
    .sort({ createdAt: -1 });

  const conciliaciones = agruparImportacionesConciliacion(importaciones);

  res.json({ conciliaciones });
});

router.get('/ultima/:tipo', async (req, res) => {
  const tipo = req.params.tipo;

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ mensaje: 'Tipo de hoja no válido' });
  }

  let importacion = null;

  if (tipo === 'conciliacion') {
    const importaciones = await ExcelImport.find({
      subidoPor: req.usuario._id,
      tipoHoja: 'conciliacion',
    }).sort({ createdAt: -1 });

    if (importaciones.length === 0) {
      return res.status(404).json({
        mensaje:
          'No hay importaciones de conciliación. Importa hojas como "Conciliación Enero" en Datos Excel.',
      });
    }

    const { periodo, ...filtros } = req.query;
    importacion = periodo
      ? buscarImportacionConciliacion(importaciones, periodo)
      : importaciones[0];

    if (!importacion) {
      return res.status(404).json({
        mensaje: `No hay conciliación importada para el periodo "${periodo}".`,
      });
    }

    const resumen = await construirResumen(importacion, filtros, req.usuario._id);
    resumen.conciliacionesDisponibles = agruparImportacionesConciliacion(importaciones);
    return res.json(resumen);
  }

  const importaciones = await ExcelImport.find({
    subidoPor: req.usuario._id,
    tipoHoja: tipo,
  })
    .sort({ createdAt: -1 })
    .limit(1);

  importacion = importaciones[0];

  if (!importacion) {
    return res.status(404).json({
      mensaje: `No hay importaciones de tipo "${tipo}". Importa la hoja correspondiente en Datos Excel.`,
    });
  }

  const filtros = req.query;
  res.json(await construirResumen(importacion, filtros, req.usuario._id));
});

router.post('/previsualizar', (req, res) => {
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
      const previsualizacion = previsualizarLibro(req.file.buffer);
      res.json(previsualizacion);
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message || 'No se pudo previsualizar el archivo Excel',
      });
    }
  });
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
      const nombreHoja = req.body?.nombreHoja?.trim() || undefined;
      const { nombreHoja: hoja, columnas, filas, totalFilas, filaEncabezado, datosEstructurados } =
        parsearExcel(req.file.buffer, { nombreHoja });

      const mapeo = detectarColumnas(columnas);
      const tipoHoja = detectarTipoHoja(mapeo, columnas, hoja);

      const importacion = await ExcelImport.create({
        nombreArchivo: req.file.originalname,
        nombreHoja: hoja,
        columnas,
        filas,
        totalFilas,
        tipoHoja,
        datosEstructurados,
        subidoPor: req.usuario._id,
      });

      if (tipoHoja === 'mapa-unidades') {
        const mapeoMapa = detectarColumnas(columnas);
        await sincronizarMapaUnidadesDesdeFilas(filas, mapeoMapa, req.usuario._id);
      }

      if (tipoHoja === 'facturacion') {
        const mapeoFacturacion = detectarColumnas(columnas);
        const resultado = await aplicarClasificacionFacturacion(importacion.filas, mapeoFacturacion);
        importacion.filas = resultado.filas;
        await importacion.save();
      }

      res.status(201).json({
        mensaje: 'Archivo importado correctamente',
        importacion: {
          id: importacion._id,
          nombreArchivo: importacion.nombreArchivo,
          nombreHoja: importacion.nombreHoja,
          columnas: importacion.columnas,
          filas: importacion.filas,
          totalFilas: importacion.totalFilas,
          filaEncabezado,
          mapeo,
          tipoHoja,
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

router.get('/:id/resumen', async (req, res) => {
  const importacion = await ExcelImport.findOne({
    _id: req.params.id,
    subidoPor: req.usuario._id,
  });

  if (!importacion) {
    return res.status(404).json({ mensaje: 'Importación no encontrada' });
  }

  res.json(await construirResumen(importacion, req.query, req.usuario._id));
});

router.get('/:id/resumen-rh', async (req, res) => {
  const importacion = await ExcelImport.findOne({
    _id: req.params.id,
    subidoPor: req.usuario._id,
  });

  if (!importacion) {
    return res.status(404).json({ mensaje: 'Importación no encontrada' });
  }

  res.json(await construirResumen(importacion, req.query, req.usuario._id));
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
