import { Factura } from '../../models/Factura.js';
import { Egreso } from '../../models/Egreso.js';
import { EgresoRecurrente } from '../../models/EgresoRecurrente.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear, mesAnterior, mesActualSistema, diaDelMesMexico, fechaMexico } from './mesUtils.js';
import { filtroFacturasPanel, normalizarVista } from './vistaUtils.js';

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function haceDias(n) {
  const d = fechaMexico();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtMoneda(monto) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

const ESTATUS_PENDIENTE = { $in: ['PENDIENTE', 'PARCIAL', 'VENCIDO'] };

export async function detectarVencidas() {
  const limite = haceDias(30);
  const facturas = await Factura.find({
    ...FILTRO_ACTIVAS,
    estatusPago: ESTATUS_PENDIENTE,
    fechaFacturacion: { $lt: limite },
    estatusEnvio: { $ne: 'CANCELADA' },
  })
    .select('total')
    .lean();

  if (!facturas.length) return [];

  const monto = redondear(facturas.reduce((acc, f) => acc + (Number(f.total) || 0), 0));
  return [
    {
      tipo: 'vencidas',
      urgencia: 'alta',
      count: facturas.length,
      monto,
      descripcion: `${facturas.length} factura${facturas.length === 1 ? '' : 's'} vencida${facturas.length === 1 ? '' : 's'} por ${fmtMoneda(monto)} total`,
      enlace: '/facturacion?estatusPago=PENDIENTE&vencidas=true',
    },
  ];
}

export async function detectarPorVencer7Dias() {
  const limite30 = haceDias(30);
  const limite23 = haceDias(23);

  const facturas = await Factura.find({
    ...FILTRO_ACTIVAS,
    estatusPago: 'PENDIENTE',
    fechaFacturacion: { $gt: limite30, $lte: limite23 },
    estatusEnvio: { $ne: 'CANCELADA' },
  })
    .select('total')
    .lean();

  if (!facturas.length) return [];

  const monto = redondear(facturas.reduce((acc, f) => acc + (Number(f.total) || 0), 0));
  return [
    {
      tipo: 'por_vencer_7d',
      urgencia: 'media',
      count: facturas.length,
      monto,
      descripcion: `${facturas.length} factura${facturas.length === 1 ? '' : 's'} vence${facturas.length === 1 ? '' : 'n'} en los próximos 7 días por ${fmtMoneda(monto)}`,
      enlace: '/facturacion?estatusPago=PENDIENTE&porVencer7d=true',
    },
  ];
}

export async function detectarEgresosRecurrentesFaltantes(mes) {
  const mesActual = mesActualSistema();
  if (mes > mesActual) return [];

  const recurrentes = await EgresoRecurrente.find({ activo: true }).sort({ diaEsperado: 1 }).lean();
  const diaHoy = diaDelMesMexico();
  const alertas = [];

  for (const rec of recurrentes) {
    const tipoRx = { $regex: escaparRegex(rec.tipoGasto), $options: 'i' };
    const provRx = { $regex: escaparRegex(rec.proveedorEsperado), $options: 'i' };

    const egresosMes = await Egreso.find({
      mes,
      tipoGasto: tipoRx,
      proveedor: provRx,
    })
      .select('total concepto proveedor tipoGasto')
      .lean();

    const esMesActual = mes === mesActual;
    const diaEsperado = rec.diaEsperado ?? 1;

    if (esMesActual && diaHoy < diaEsperado) continue;

    if (!egresosMes.length) {
      let urgencia = 'media';
      if (esMesActual) {
        const diasPasados = diaHoy - diaEsperado;
        if (diasPasados > 10) urgencia = 'alta';
        else if (diasPasados > 3) urgencia = 'media';
        else if (diasPasados <= 0) continue;
      } else {
        urgencia = 'alta';
      }

      const montoTxt = rec.montoReferencia ? `, monto ~${fmtMoneda(rec.montoReferencia)}` : '';
      const params = new URLSearchParams({
        nuevo: '1',
        tipoGasto: rec.tipoGasto,
        proveedor: rec.proveedorEsperado,
        unidad: rec.unidad || 'Grupo',
        concepto: rec.nombre,
      });
      if (rec.montoReferencia) params.set('subtotal', String(rec.montoReferencia));

      alertas.push({
        tipo: 'recurrente_faltante',
        urgencia,
        recurrenteId: String(rec._id),
        descripcion: `Falta capturar: ${rec.nombre}. Suele pagarse día ${diaEsperado}${montoTxt}`,
        enlace: `/egresos?${params.toString()}`,
      });
      continue;
    }

    if (rec.montoReferencia && rec.montoReferencia > 0) {
      const total = redondear(egresosMes.reduce((acc, e) => acc + (Number(e.total) || 0), 0));
      const ref = rec.montoReferencia;
      const tolerancia = rec.tolerancia ?? 0.1;
      const variacion = Math.abs(total - ref) / ref;

      if (variacion > tolerancia) {
        const signo = total >= ref ? '+' : '';
        const pct = redondear(variacion * 100);
        alertas.push({
          tipo: 'recurrente_variacion',
          urgencia: 'media',
          recurrenteId: String(rec._id),
          descripcion: `${rec.nombre} capturado por ${fmtMoneda(total)}, esperado ${fmtMoneda(ref)} (variación ${signo}${pct}%)`,
          enlace: `/egresos?mes=${mes}&tipoGasto=${encodeURIComponent(rec.tipoGasto)}`,
        });
      }
    }
  }

  return alertas;
}

export async function detectarNovamexArrastre(mes) {
  const mesPrev = mesAnterior(mes);
  const novamexActual = await Factura.findOne({
    ...FILTRO_ACTIVAS,
    mes,
    cliente: { $regex: /novamex/i },
    estatusPago: ESTATUS_PENDIENTE,
    estatusEnvio: { $ne: 'CANCELADA' },
  }).lean();

  if (!novamexActual) return [];

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

  if (!pagoTarde && novamexPrev.length === 0) return [];

  return [
    {
      tipo: 'novamex_arrastre',
      urgencia: 'baja',
      descripcion: 'Novamex suele pagar con arrastre',
      enlace: `/facturacion?mesFacturacion=${mes}&cliente=Novamex`,
    },
  ];
}

export async function detectarSinClasificar(mes, vista = 'cobro') {
  const v = normalizarVista(vista);
  const count = await Factura.countDocuments({
    ...filtroFacturasPanel(mes, v),
    unidad: null,
  });

  if (!count) return [];

  const enlace =
    v === 'cobro'
      ? `/facturacion?mesPago=${mes}&sinClasificar=true`
      : `/facturacion?mesFacturacion=${mes}&sinClasificar=true`;

  return [
    {
      tipo: 'sin_clasificar',
      urgencia: 'baja',
      count,
      descripcion: `${count} factura${count === 1 ? '' : 's'} sin clasificar`,
      enlace,
    },
  ];
}

export async function detectarAlertas(mes, vista = 'cobro') {
  const resultados = await Promise.all([
    detectarVencidas(),
    detectarPorVencer7Dias(),
    detectarEgresosRecurrentesFaltantes(mes),
    detectarNovamexArrastre(mes),
    detectarSinClasificar(mes, vista),
  ]);

  const alertas = resultados.flat();
  const orden = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => (orden[a.urgencia] ?? 9) - (orden[b.urgencia] ?? 9));
  return alertas;
}
