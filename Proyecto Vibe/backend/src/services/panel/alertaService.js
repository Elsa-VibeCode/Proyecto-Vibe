import { Factura } from '../../models/Factura.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear, mesAnterior } from './mesUtils.js';
import { existeTipoGasto, existeTransferLatam } from './egresoPanelService.js';

function hace30Dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

export async function detectarAlertas(mes, config) {
  const alertas = [];
  const limiteVencimiento = hace30Dias();

  const vencidas = await Factura.find({
    ...FILTRO_ACTIVAS,
    estatusPago: { $in: ['PENDIENTE', 'PARCIAL', 'VENCIDO'] },
    fechaFacturacion: { $lt: limiteVencimiento },
    estatusEnvio: { $ne: 'CANCELADA' },
  })
    .select('total')
    .lean();

  if (vencidas.length > 0) {
    const monto = redondear(vencidas.reduce((acc, f) => acc + (Number(f.total) || 0), 0));
    alertas.push({
      tipo: 'vencidas',
      urgencia: 'alta',
      count: vencidas.length,
      monto,
      descripcion: `${vencidas.length} factura${vencidas.length === 1 ? '' : 's'} vencida${vencidas.length === 1 ? '' : 's'} por ${monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} total`,
      enlace: '/facturacion?estatusPago=PENDIENTE',
    });
  }

  const tieneKonfio = await existeTipoGasto(mes, 'TARJETA.?KONFIO');
  if (!tieneKonfio) {
    alertas.push({
      tipo: 'konfio_faltante',
      urgencia: 'media',
      descripcion: 'Falta capturar pago Konfío de este mes',
      enlace: `/egresos?mes=${mes}`,
    });
  }

  const tieneLatam = await existeTransferLatam(mes);
  if (!tieneLatam) {
    const montoLatam = Number(config.latamKonfioMensual) || 7153.33;
    alertas.push({
      tipo: 'latam_faltante',
      urgencia: 'media',
      monto: montoLatam,
      descripcion: `Falta capturar transferencia LATAM Konfío ${montoLatam.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`,
      enlace: `/egresos?mes=${mes}`,
    });
  }

  const mesPrev = mesAnterior(mes);
  const novamexActual = await Factura.findOne({
    ...FILTRO_ACTIVAS,
    mes,
    cliente: { $regex: /novamex/i },
    estatusPago: { $in: ['PENDIENTE', 'PARCIAL', 'VENCIDO'] },
    estatusEnvio: { $ne: 'CANCELADA' },
  }).lean();

  if (novamexActual) {
    const novamexPrev = await Factura.find({
      ...FILTRO_ACTIVAS,
      mes: mesPrev,
      cliente: { $regex: /novamex/i },
      estatusPago: 'PAGADO',
      estatusEnvio: { $ne: 'CANCELADA' },
      fechaPago: { $ne: null },
    }).lean();

    const pagoTarde = novamexPrev.some((f) => {
      const mesPago = f.fechaPago.toISOString().slice(0, 7);
      return mesPago > mesPrev;
    });

    if (pagoTarde || novamexPrev.length > 0) {
      alertas.push({
        tipo: 'novamex_arrastre',
        urgencia: 'baja',
        descripcion: 'Novamex suele pagar con arrastre',
        enlace: `/facturacion?mesFacturacion=${mes}&cliente=Novamex`,
      });
    }
  }

  const sinClasificar = await Factura.countDocuments({
    ...FILTRO_ACTIVAS,
    mes,
    unidad: null,
    estatusEnvio: { $ne: 'CANCELADA' },
  });

  if (sinClasificar > 0) {
    alertas.push({
      tipo: 'sin_clasificar',
      urgencia: 'baja',
      count: sinClasificar,
      descripcion: `${sinClasificar} factura${sinClasificar === 1 ? '' : 's'} sin clasificar`,
      enlace: `/facturacion?mesFacturacion=${mes}&sinClasificar=true`,
    });
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => (orden[a.urgencia] ?? 9) - (orden[b.urgencia] ?? 9));

  return alertas;
}
