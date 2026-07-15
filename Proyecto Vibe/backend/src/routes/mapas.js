import { Router } from 'express';
import { MapaUnidad } from '../models/MapaUnidad.js';
import { MapaProveedor } from '../models/MapaProveedor.js';
import { ExcelImport } from '../models/ExcelImport.js';
import { Factura } from '../models/Factura.js';
import { protegerRuta, requiereRol } from '../middleware/auth.js';
import { sembrarMapasSiVacios, asegurarMapaUnidadesDisponible } from '../services/mapaSync.js';
import { detectarColumnas } from '../utils/excelFiltros.js';
import { reclasificarFacturasDesdeMapa, FILTRO_ACTIVAS } from '../services/facturaService.js';
import {
  enriquecerFilasFacturacion,
  resumenClasificacionFacturacion,
} from '../utils/clasificacionMotor.js';

const router = Router();
const ROLES_EDICION = ['admin', 'editor'];

router.use(protegerRuta);

router.get('/unidades', async (_req, res) => {
  await asegurarMapaUnidadesDisponible();
  const unidades = await MapaUnidad.find().sort({ clienteRazonSocial: 1 });
  res.json({ unidades });
});

router.post('/sembrar-inicial', requiereRol('admin'), async (req, res) => {
  const resultado = await sembrarMapasSiVacios(req.usuario._id);
  res.json({
    mensaje: resultado.yaExistian
      ? 'Los mapas ya tenían datos; no se sobrescribió nada.'
      : 'Mapas iniciales cargados correctamente.',
    ...resultado,
  });
});

router.post('/unidades', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const unidad = await MapaUnidad.create({
      clienteRazonSocial: req.body.clienteRazonSocial,
      unidad: req.body.unidad,
      estado: req.body.estado ?? 'por_confirmar',
      notas: req.body.notas ?? '',
      actualizadoPor: req.usuario._id,
    });
    res.status(201).json({ unidad });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ mensaje: 'Ese cliente ya existe en el mapa de unidades' });
    }
    res.status(400).json({ mensaje: error.message });
  }
});

router.put('/unidades/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const unidad = await MapaUnidad.findByIdAndUpdate(
    req.params.id,
    {
      clienteRazonSocial: req.body.clienteRazonSocial,
      unidad: req.body.unidad,
      estado: req.body.estado,
      notas: req.body.notas ?? '',
      actualizadoPor: req.usuario._id,
    },
    { new: true, runValidators: true }
  );

  if (!unidad) {
    return res.status(404).json({ mensaje: 'Entrada no encontrada' });
  }

  res.json({ unidad });
});

router.delete('/unidades/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const unidad = await MapaUnidad.findByIdAndDelete(req.params.id);
  if (!unidad) {
    return res.status(404).json({ mensaje: 'Entrada no encontrada' });
  }
  res.json({ mensaje: 'Cliente eliminado del mapa' });
});

router.get('/proveedores', async (_req, res) => {
  const proveedores = await MapaProveedor.find().sort({ razonSocial: 1 });
  res.json({ proveedores });
});

router.post('/proveedores', requiereRol(...ROLES_EDICION), async (req, res) => {
  try {
    const proveedor = await MapaProveedor.create({
      rfcEmisor: req.body.rfcEmisor ?? '',
      razonSocial: req.body.razonSocial,
      unidad: req.body.unidad,
      estado: req.body.estado ?? 'por_confirmar',
      notas: req.body.notas ?? '',
      actualizadoPor: req.usuario._id,
    });
    res.status(201).json({ proveedor });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ mensaje: 'Ese proveedor ya existe en el mapa' });
    }
    res.status(400).json({ mensaje: error.message });
  }
});

router.put('/proveedores/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const proveedor = await MapaProveedor.findByIdAndUpdate(
    req.params.id,
    {
      rfcEmisor: req.body.rfcEmisor ?? '',
      razonSocial: req.body.razonSocial,
      unidad: req.body.unidad,
      estado: req.body.estado,
      notas: req.body.notas ?? '',
      actualizadoPor: req.usuario._id,
    },
    { new: true, runValidators: true }
  );

  if (!proveedor) {
    return res.status(404).json({ mensaje: 'Entrada no encontrada' });
  }

  res.json({ proveedor });
});

router.delete('/proveedores/:id', requiereRol(...ROLES_EDICION), async (req, res) => {
  const proveedor = await MapaProveedor.findByIdAndDelete(req.params.id);
  if (!proveedor) {
    return res.status(404).json({ mensaje: 'Entrada no encontrada' });
  }
  res.json({ mensaje: 'Proveedor eliminado del mapa' });
});

router.post('/reclasificar-facturacion', requiereRol(...ROLES_EDICION), async (req, res) => {
  const totalFacturas = await Factura.countDocuments(FILTRO_ACTIVAS);
  if (totalFacturas > 0) {
    const resultado = await reclasificarFacturasDesdeMapa();
    return res.json({
      mensaje: `Facturación reclasificada (${resultado.actualizadas} facturas; las manuales no se modificaron)`,
      facturasActualizadas: resultado.actualizadas,
    });
  }

  const importacion = await ExcelImport.findOne({
    subidoPor: req.usuario._id,
    tipoHoja: 'facturacion',
  }).sort({ createdAt: -1 });

  if (!importacion) {
    return res.status(404).json({
      mensaje: 'No hay importación de facturación. Importa FACTURACION INGRESOS primero.',
    });
  }

  const mapeo = detectarColumnas(importacion.columnas);
  const mapaUnidades = await MapaUnidad.find().lean();
  const filasEnriquecidas = enriquecerFilasFacturacion(
    importacion.filas,
    mapeo,
    mapaUnidades
  );

  importacion.filas = filasEnriquecidas;
  await importacion.save();

  res.json({
    mensaje: 'Facturación reclasificada con el mapa actual',
    importacionId: importacion._id,
    resumenClasificacion: resumenClasificacionFacturacion(filasEnriquecidas),
  });
});

export default router;
