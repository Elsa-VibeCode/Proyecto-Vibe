import { unidadEfectiva, esFechaFacturaValida } from '../models/Factura.js';
import {
  normalizarClave,
  crearIndiceMapaUnidades,
  resumenClasificacionFacturacion,
} from '../utils/clasificacionMotor.js';

// Texto de estatus compatible con el Excel original (filtros y cards).
function estatusPagoDisplay(estatus) {
  const map = {
    PAGADO: 'Pagado',
    PENDIENTE: 'Pendiente',
    PARCIAL: 'Parcial',
    VENCIDO: 'Vencido',
    CANCELADO: 'Cancelado',
  };
  return map[estatus] ?? estatus ?? '';
}

function estatusEnvioDisplay(estatus) {
  const map = {
    ENVIADA: 'Enviada',
    POR_ENVIAR: 'Por enviar',
    CANCELADA: 'CANCELADA',
  };
  return map[estatus] ?? estatus ?? '';
}

function areaVentaDisplay(unidad) {
  if (!unidad) return '';
  if (unidad === 'Consulting') return 'Consulting';
  if (unidad === 'Strategy') return 'Strategy';
  return unidad;
}

function estadoClasificacionDesdeFactura(factura, indice) {
  if (!factura.unidad) return 'no_encontrado';
  if (factura.unidadManual) return 'manual';
  const entrada = indice.get(normalizarClave(factura.cliente));
  if (factura.clasificacionAuto && entrada) {
    return entrada.estado === 'confirmado' ? 'auto_confirmado' : 'por_confirmar';
  }
  return factura.clasificacionAuto ? 'auto_confirmado' : 'por_confirmar';
}

// Convierte un documento Factura al formato de fila que espera /facturacion (columnas Excel).
export function facturaAFilaExcel(factura, mapeo, indiceMapa) {
  const excluidoDeTotales =
    factura.estatusEnvio === 'CANCELADA' || factura.estatusPago === 'CANCELADO';

  const unidadClasificada = factura.unidad ? unidadEfectiva(factura.unidad) : 'sin_clasificar';
  const estadoClasificacion = estadoClasificacionDesdeFactura(factura, indiceMapa);

  const fila = {};
  const set = (campo, valor) => {
    const col = mapeo[campo];
    if (col) fila[col] = valor ?? '';
  };

  set('fechaFacturacion', esFechaFacturaValida(factura.fechaFacturacion) ? factura.fechaFacturacion : '');
  set('noFactura', factura.noFactura);
  set('fechaPago', esFechaFacturaValida(factura.fechaPago) ? factura.fechaPago : '');
  set('cliente', factura.cliente);
  set('conceptoFactura', factura.concepto);
  set('areaVenta', areaVentaDisplay(factura.unidad));
  set('subtotal', factura.subtotal);
  set('iva', factura.iva);
  set('total', factura.total);
  set('estatusEnvio', estatusEnvioDisplay(factura.estatusEnvio));
  set('estatusPago', estatusPagoDisplay(factura.estatusPago));
  set('rfcEmisor', factura.rfcEmisor);

  return {
    ...fila,
    facturaId: String(factura._id),
    unidadManual: Boolean(factura.unidadManual),
    unidadClasificada,
    estadoClasificacion,
    excluidoDeTotales,
  };
}

export function facturasComoFilasExcel(facturas, mapeo, mapaUnidades = []) {
  const indice = crearIndiceMapaUnidades(mapaUnidades);
  return facturas.map((f) => facturaAFilaExcel(f, mapeo, indice));
}

export function resumenClasificacionDesdeFilas(filas, mapaUnidades) {
  return {
    resumen: resumenClasificacionFacturacion(filas),
    mapaCargado: mapaUnidades.length > 0,
  };
}
