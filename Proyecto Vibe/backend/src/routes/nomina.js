import { Router } from 'express';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import { asegurarColaboradoresDisponibles } from '../services/colaboradorSync.js';
import {
  obtenerResumenNomina,
  reclasificarTodosLosPagos,
  crearPagoManual,
  sincronizarPagosDesdeImportacion,
} from '../services/nominaService.js';
import { ExcelImport } from '../models/ExcelImport.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

router.use(protegerRuta);

router.get('/resumen', async (req, res) => {
  await asegurarColaboradoresDisponibles();
  const data = await obtenerResumenNomina(req.usuario._id, req.query);
  res.json(data);
});

router.post('/pagos', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const pago = await crearPagoManual(
      {
        ...req.body,
        fecha: new Date(req.body.fecha),
      },
      req.usuario._id
    );
    res.status(201).json({ pago });
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
});

router.post('/reclasificar', requiereRol(...ROLES_EDICION), async (req, res) => {
  const resultado = await reclasificarTodosLosPagos(req.usuario._id);
  res.json({
    mensaje: `Reclasificados ${resultado.actualizados} pagos de nómina.`,
    ...resultado,
  });
});

router.post('/importar-ultima', requiereRol(...ROLES_EDICION), async (req, res) => {
  const importacion = await ExcelImport.findOne({
    subidoPor: req.usuario._id,
    tipoHoja: 'nomina-real',
  }).sort({ createdAt: -1 });

  if (!importacion) {
    return res.status(404).json({
      mensaje: 'No hay importación de Nómina Real 2026. Impórtala desde Datos Excel.',
    });
  }

  const resultado = await sincronizarPagosDesdeImportacion(importacion, req.usuario._id);
  res.json({
    mensaje: `Sincronizados ${resultado.sincronizados} pagos desde ${importacion.nombreArchivo}.`,
    importacion: {
      id: importacion._id,
      nombreArchivo: importacion.nombreArchivo,
      nombreHoja: importacion.nombreHoja,
    },
    ...resultado,
  });
});

export default router;
