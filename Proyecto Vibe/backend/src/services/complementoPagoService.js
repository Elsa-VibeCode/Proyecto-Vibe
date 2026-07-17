import { ComplementoPago } from '../models/ComplementoPago.js';
import { Factura } from '../models/Factura.js';
import { FILTRO_ACTIVAS } from './facturaService.js';
import { estaVencido } from '../utils/repDeadline.js';

function redondear(n) {
  return Math.round(Number(n) * 100) / 100;
}

function mesDesdeFechaPago(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.toISOString().slice(0, 7);
}

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function recalcularFacturaComplementos(facturaId, session = null) {
  const opts = session ? { session } : {};
  const factura = await Factura.findById(facturaId).session(session ?? null);
  if (!factura || factura.deletedAt) return null;

  const complementos = await ComplementoPago.find({
    'facturasRelacionadas.facturaId': facturaId,
  }).session(session ?? null);

  let montoPagado = 0;
  const ids = [];
  for (const comp of complementos) {
    ids.push(comp._id);
    const rel = comp.facturasRelacionadas.find(
      (r) => String(r.facturaId) === String(facturaId)
    );
    if (rel) montoPagado += Number(rel.importePagado) || 0;
  }

  factura.montoPagado = redondear(montoPagado);
  factura.complementosEmitidos = ids;
  await factura.save(opts);
  return factura;
}

export async function recalcularFacturasDeComplemento(facturaIds, session = null) {
  const unicos = [...new Set(facturaIds.map(String))];
  for (const id of unicos) {
    await recalcularFacturaComplementos(id, session);
  }
}

export function construirFiltroComplementos(query = {}) {
  const { mes, unidad, cliente, estatus, q } = query;
  const filtro = {};

  if (mes && /^\d{4}-\d{2}$/.test(String(mes))) {
    const [y, m] = String(mes).split('-').map(Number);
    filtro.fechaPago = {
      $gte: new Date(Date.UTC(y, m - 1, 1)),
      $lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  if (unidad) filtro.unidad = unidad;
  if (cliente) filtro.cliente = { $regex: escaparRegex(cliente), $options: 'i' };

  if (q) {
    const rx = { $regex: escaparRegex(q), $options: 'i' };
    filtro.$or = [{ folio: rx }, { cliente: rx }, { uuid: rx }];
  }

  return { filtro, estatus };
}

export async function listarComplementos(query = {}) {
  const { pagina = 1, limite = 50, estatus, ...rest } = query;
  const { filtro } = construirFiltroComplementos(rest);
  const skip = (Number(pagina) - 1) * Number(limite);

  let complementos = await ComplementoPago.find(filtro)
    .sort({ fechaPago: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limite))
    .lean();

  if (estatus === 'pendientes' || estatus === 'vencidos') {
    const facturaIds = [
      ...new Set(
        complementos.flatMap((c) => c.facturasRelacionadas.map((r) => String(r.facturaId)))
      ),
    ];
    const facturas = await Factura.find({ _id: { $in: facturaIds } }).lean();
    const mapa = new Map(facturas.map((f) => [String(f._id), f]));
    complementos = complementos.filter((c) => {
      const tienePendiente = c.facturasRelacionadas.some((r) => {
        const f = mapa.get(String(r.facturaId));
        return f && ['pendiente', 'parcial'].includes(f.estatusComplemento);
      });
      if (estatus === 'pendientes') return tienePendiente;
      return c.facturasRelacionadas.some((r) => {
        const f = mapa.get(String(r.facturaId));
        return f && estaVencido(f);
      });
    });
  }

  const total = await ComplementoPago.countDocuments(filtro);

  return {
    complementos,
    paginacion: {
      total,
      pagina: Number(pagina),
      limite: Number(limite),
      paginas: Math.ceil(total / Number(limite)) || 1,
    },
  };
}

export async function sugerirSiguienteFolio(prefijo = 'GBL-P-') {
  const rx = new RegExp(`^${escaparRegex(prefijo)}(\\d+)$`, 'i');
  const ultimos = await ComplementoPago.find({ folio: { $regex: rx } })
    .select('folio')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  let max = 0;
  for (const c of ultimos) {
    const m = String(c.folio).match(rx);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefijo}${String(max + 1).padStart(4, '0')}`;
}

async function enriquecerRelaciones(relaciones) {
  const resultado = [];
  for (const rel of relaciones) {
    const factura = await Factura.findOne({ _id: rel.facturaId, ...FILTRO_ACTIVAS });
    if (!factura) throw new Error(`Factura ${rel.facturaId} no encontrada`);

    if (factura.metodoPago !== 'PPD') {
      throw new Error(`La factura ${factura.noFactura} no es PPD`);
    }

    const importe = redondear(rel.importePagado);
    if (importe <= 0) throw new Error(`Importe inválido para ${factura.noFactura}`);

    const saldoAnterior = redondear(factura.total - factura.montoPagado);
    if (importe > saldoAnterior + 0.01) {
      throw new Error(
        `Importe ${importe} excede saldo pendiente ${saldoAnterior} de ${factura.noFactura}`
      );
    }

    resultado.push({
      facturaId: factura._id,
      noFactura: factura.noFactura,
      uuidFactura: factura.uuid || '',
      importePagado: importe,
      numParcialidad: rel.numParcialidad ?? 1,
      saldoAnterior,
      saldoInsoluto: redondear(saldoAnterior - importe),
      monedaP: rel.monedaP || 'MXN',
    });
  }
  return resultado;
}

export async function crearComplemento(datos, clerkUserId) {
  const facturasRelacionadas = await enriquecerRelaciones(datos.facturasRelacionadas || []);
  const monto = redondear(datos.monto);
  const suma = redondear(
    facturasRelacionadas.reduce((acc, r) => acc + r.importePagado, 0)
  );
  if (Math.abs(suma - monto) > 0.01) {
    throw new Error('La suma de importes debe igualar el monto del complemento');
  }

  const complemento = await ComplementoPago.create({
    uuid: datos.uuid?.trim().toLowerCase() || undefined,
    folio: datos.folio?.trim(),
    fechaEmision: new Date(datos.fechaEmision),
    fechaPago: new Date(datos.fechaPago),
    monto,
    moneda: datos.moneda || 'MXN',
    tipoCambio: datos.tipoCambio ?? 1,
    formaPago: datos.formaPago || '03',
    cuentaBeneficiaria: datos.cuentaBeneficiaria,
    facturasRelacionadas,
    unidad: datos.unidad,
    cliente: datos.cliente,
    observaciones: datos.observaciones,
    origen: datos.origen || 'manual',
    createdBy: clerkUserId,
  });

  await recalcularFacturasDeComplemento(facturasRelacionadas.map((r) => r.facturaId));
  return complemento;
}

export async function actualizarComplemento(id, datos) {
  const complemento = await ComplementoPago.findById(id);
  if (!complemento) return null;

  const idsAnteriores = complemento.facturasRelacionadas.map((r) => r.facturaId);

  if (datos.facturasRelacionadas) {
    complemento.facturasRelacionadas = await enriquecerRelaciones(datos.facturasRelacionadas);
  }
  if (datos.folio !== undefined) complemento.folio = datos.folio?.trim();
  if (datos.fechaEmision) complemento.fechaEmision = new Date(datos.fechaEmision);
  if (datos.fechaPago) complemento.fechaPago = new Date(datos.fechaPago);
  if (datos.monto !== undefined) complemento.monto = redondear(datos.monto);
  if (datos.moneda) complemento.moneda = datos.moneda;
  if (datos.tipoCambio !== undefined) complemento.tipoCambio = datos.tipoCambio;
  if (datos.formaPago) complemento.formaPago = datos.formaPago;
  if (datos.cuentaBeneficiaria !== undefined) complemento.cuentaBeneficiaria = datos.cuentaBeneficiaria;
  if (datos.unidad) complemento.unidad = datos.unidad;
  if (datos.cliente !== undefined) complemento.cliente = datos.cliente;
  if (datos.observaciones !== undefined) complemento.observaciones = datos.observaciones;
  if (datos.uuid !== undefined) complemento.uuid = datos.uuid?.trim().toLowerCase() || undefined;

  await complemento.save();

  const idsNuevos = complemento.facturasRelacionadas.map((r) => r.facturaId);
  await recalcularFacturasDeComplemento([...idsAnteriores, ...idsNuevos]);
  return complemento;
}

export async function eliminarComplemento(id) {
  const complemento = await ComplementoPago.findById(id);
  if (!complemento) return null;

  const ids = complemento.facturasRelacionadas.map((r) => r.facturaId);
  await complemento.deleteOne();
  await recalcularFacturasDeComplemento(ids);
  return complemento;
}

export async function obtenerFacturasPendientesComplemento({ vencidas = false } = {}) {
  const facturas = await Factura.find({
    ...FILTRO_ACTIVAS,
    metodoPago: 'PPD',
    estatusPago: { $in: ['PAGADO', 'PARCIAL'] },
    estatusComplemento: { $in: ['pendiente', 'parcial'] },
    estatusEnvio: { $ne: 'CANCELADA' },
  })
    .sort({ fechaPago: 1 })
    .lean();

  if (!vencidas) return facturas;
  return facturas.filter((f) => estaVencido(f));
}

export async function conteoPendientesComplemento() {
  const pendientes = await obtenerFacturasPendientesComplemento();
  const vencidas = pendientes.filter((f) => estaVencido(f));
  return {
    total: pendientes.length,
    vencidas: vencidas.length,
    pendientes: pendientes.length - vencidas.length,
  };
}

export async function facturasPpdDisponibles(cliente, facturaIdPreseleccionada) {
  const filtro = {
    ...FILTRO_ACTIVAS,
    metodoPago: 'PPD',
    estatusPago: { $in: ['PAGADO', 'PARCIAL'] },
    estatusEnvio: { $ne: 'CANCELADA' },
    $expr: { $gt: [{ $subtract: ['$total', '$montoPagado'] }, 0.01] },
  };

  if (cliente) {
    filtro.cliente = { $regex: escaparRegex(cliente), $options: 'i' };
  }

  const facturas = await Factura.find(filtro)
    .select('noFactura cliente total montoPagado saldoPendiente fechaPago uuid unidad estatusComplemento')
    .sort({ fechaPago: -1 })
    .lean();

  if (facturaIdPreseleccionada) {
    const ya = facturas.some((f) => String(f._id) === String(facturaIdPreseleccionada));
    if (!ya) {
      const extra = await Factura.findOne({ _id: facturaIdPreseleccionada, ...FILTRO_ACTIVAS }).lean();
      if (extra) facturas.unshift(extra);
    }
  }

  return facturas;
}

export { mesDesdeFechaPago };
