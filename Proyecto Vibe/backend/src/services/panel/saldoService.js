import { Factura } from '../../models/Factura.js';
import { Egreso } from '../../models/Egreso.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear, finMesUtc, mesAnterior, inicioMesUtc } from './mesUtils.js';
import { normalizarVista, filtroFacturasPanel, rangoMesUtc } from './vistaUtils.js';

function unidadFiltro(unidad) {
  if (unidad === 'consulting') return { $in: ['Consulting', 'Strategy'] };
  if (unidad === 'technologies') return 'Technologies';
  if (unidad === 'grupo') return 'Grupo';
  return null;
}

async function ingresosUnidadMes(unidad, mes, vista) {
  const uf = unidadFiltro(unidad);
  if (!uf) return 0;

  const match = { ...filtroFacturasPanel(mes, vista), unidad: uf };
  const rows = await Factura.aggregate([
    { $match: match },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  return redondear(rows[0]?.suma ?? 0);
}

async function ingresosAcumuladosHasta(unidad, mesHasta, vista) {
  const uf = unidadFiltro(unidad);
  if (!uf) return 0;

  const v = normalizarVista(vista);
  let match;

  if (v === 'cobro') {
    match = {
      ...FILTRO_ACTIVAS,
      unidad: uf,
      estatusEnvio: { $ne: 'CANCELADA' },
      estatusPago: { $ne: 'CANCELADO' },
      fechaPago: { $exists: true, $ne: null, $lte: finMesUtc(mesHasta) },
    };
  } else {
    match = {
      ...FILTRO_ACTIVAS,
      unidad: uf,
      mes: { $lte: mesHasta },
      estatusEnvio: { $ne: 'CANCELADA' },
      estatusPago: { $ne: 'CANCELADO' },
    };
  }

  const rows = await Factura.aggregate([
    { $match: match },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  return redondear(rows[0]?.suma ?? 0);
}

async function egresosUnidadMes(unidad, mes) {
  const map = { consulting: 'Consulting', technologies: 'Technologies', grupo: 'Grupo' };
  const u = map[unidad];
  if (!u) return 0;

  const rows = await Egreso.aggregate([
    { $match: { mes, unidad: u } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  return redondear(rows[0]?.suma ?? 0);
}

async function egresosUnidadAcumulado(unidad, mesHasta) {
  const map = { consulting: 'Consulting', technologies: 'Technologies', grupo: 'Grupo' };
  const u = map[unidad];
  if (!u) return 0;

  const rows = await Egreso.aggregate([
    { $match: { mes: { $lte: mesHasta }, unidad: u } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  return redondear(rows[0]?.suma ?? 0);
}

async function saldoAcumuladoHasta(unidad, mesHasta, vista) {
  const ingresos = await ingresosAcumuladosHasta(unidad, mesHasta, vista);
  const egresos = await egresosUnidadAcumulado(unidad, mesHasta);
  return redondear(ingresos - egresos);
}

export async function evolucionMensual(mes, regla, vista = 'cobro') {
  const v = normalizarVista(vista);
  const mesPrev = mesAnterior(mes);
  const aporte10 = regla.reglaAplica ? regla.aporteEsperado : 0;

  const consultingIngresos = await ingresosUnidadMes('consulting', mes, v);
  const techIngresos = await ingresosUnidadMes('technologies', mes, v);
  const grupoIngresosDirectos = await ingresosUnidadMes('grupo', mes, v);

  const consultingEgresos = await egresosUnidadMes('consulting', mes);
  const techEgresos = await egresosUnidadMes('technologies', mes);
  const grupoEgresos = await egresosUnidadMes('grupo', mes);

  const latamRows = await Egreso.aggregate([
    { $match: { mes, unidad: 'Technologies', esTransferLatam: true } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  const latamKonfio = redondear(latamRows[0]?.suma ?? 0);

  const saldoInicialConsulting = await saldoAcumuladoHasta('consulting', mesPrev, v);
  const saldoInicialTech = await saldoAcumuladoHasta('technologies', mesPrev, v);
  const saldoInicialGrupo = await saldoAcumuladoHasta('grupo', mesPrev, v);

  const movConsulting = redondear(-aporte10);
  const movTech = redondear(aporte10 + latamKonfio);
  const movGrupo = redondear(aporte10);

  const filas = [
    {
      unidad: 'consulting',
      etiqueta: 'Consulting',
      saldoInicial: saldoInicialConsulting,
      ingresos: consultingIngresos,
      egresos: consultingEgresos,
      movInternos: movConsulting,
      movInternosEtiqueta: '−10% a Grupo',
      saldoFinal: redondear(saldoInicialConsulting + consultingIngresos - consultingEgresos + movConsulting),
    },
    {
      unidad: 'technologies',
      etiqueta: 'Technologies',
      saldoInicial: saldoInicialTech,
      ingresos: techIngresos,
      egresos: techEgresos,
      movInternos: movTech,
      movInternosEtiqueta: latamKonfio > 0 ? '+LATAM Konfío' : '+10% Consulting',
      saldoFinal: redondear(saldoInicialTech + techIngresos - techEgresos + movTech),
    },
    {
      unidad: 'grupo',
      etiqueta: 'Grupo',
      saldoInicial: saldoInicialGrupo,
      ingresos: redondear(grupoIngresosDirectos + aporte10),
      egresos: grupoEgresos,
      movInternos: 0,
      movInternosEtiqueta: '—',
      saldoFinal: redondear(saldoInicialGrupo + grupoIngresosDirectos + aporte10 - grupoEgresos),
    },
  ];

  const cajaIngresos = redondear(consultingIngresos + techIngresos + grupoIngresosDirectos);
  const cajaEgresos = redondear(consultingEgresos + techEgresos + grupoEgresos);
  const cajaInicial = redondear(saldoInicialConsulting + saldoInicialTech + saldoInicialGrupo);

  filas.push({
    unidad: 'caja_bbva',
    etiqueta: 'Caja BBVA',
    saldoInicial: cajaInicial,
    ingresos: cajaIngresos,
    egresos: cajaEgresos,
    movInternos: 0,
    movInternosEtiqueta: '—',
    saldoFinal: redondear(cajaInicial + cajaIngresos - cajaEgresos),
  });

  return filas;
}

export async function evolucionYtd(mes, reglaAportePct, reglaAplicaFn, vista = 'cobro') {
  const v = normalizarVista(vista);
  const [y] = mes.split('-');
  const inicioAnio = `${y}-01`;

  async function sumIngresosUnidad(unidad) {
    const uf = unidadFiltro(unidad);
    if (!uf) return 0;

    let match;
    if (v === 'cobro') {
      const rango = rangoMesUtc(mes);
      match = {
        ...FILTRO_ACTIVAS,
        unidad: uf,
        estatusEnvio: { $ne: 'CANCELADA' },
        estatusPago: { $ne: 'CANCELADO' },
        fechaPago: {
          $exists: true,
          $ne: null,
          $gte: inicioMesUtc(inicioAnio),
          $lte: rango.$lte,
        },
      };
    } else {
      match = {
        ...FILTRO_ACTIVAS,
        mes: { $gte: inicioAnio, $lte: mes },
        unidad: uf,
        estatusEnvio: { $ne: 'CANCELADA' },
        estatusPago: { $ne: 'CANCELADO' },
      };
    }

    const rows = await Factura.aggregate([
      { $match: match },
      { $group: { _id: null, suma: { $sum: '$total' } } },
    ]);
    return redondear(rows[0]?.suma ?? 0);
  }

  async function sumEgresos(unidad) {
    const map = { consulting: 'Consulting', technologies: 'Technologies', grupo: 'Grupo' };
    const rows = await Egreso.aggregate([
      { $match: { mes: { $gte: inicioAnio, $lte: mes }, unidad: map[unidad] } },
      { $group: { _id: null, suma: { $sum: '$total' } } },
    ]);
    return redondear(rows[0]?.suma ?? 0);
  }

  const consultingIngresos = await sumIngresosUnidad('consulting');
  const techIngresos = await sumIngresosUnidad('technologies');
  const grupoIngresosDirectos = await sumIngresosUnidad('grupo');

  const consultingEgresos = await sumEgresos('consulting');
  const techEgresos = await sumEgresos('technologies');
  const grupoEgresos = await sumEgresos('grupo');

  const aporte10Ytd = reglaAplicaFn ? redondear(consultingIngresos * reglaAportePct) : 0;

  const latamRows = await Egreso.aggregate([
    { $match: { mes: { $gte: inicioAnio, $lte: mes }, unidad: 'Technologies', esTransferLatam: true } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  const latamKonfio = redondear(latamRows[0]?.suma ?? 0);

  const movConsulting = redondear(-aporte10Ytd);
  const movTech = redondear(aporte10Ytd + latamKonfio);

  return [
    {
      unidad: 'consulting',
      etiqueta: 'Consulting',
      saldoInicial: 0,
      ingresos: consultingIngresos,
      egresos: consultingEgresos,
      movInternos: movConsulting,
      movInternosEtiqueta: '−10% a Grupo',
      saldoFinal: redondear(consultingIngresos - consultingEgresos + movConsulting),
    },
    {
      unidad: 'technologies',
      etiqueta: 'Technologies',
      saldoInicial: 0,
      ingresos: techIngresos,
      egresos: techEgresos,
      movInternos: movTech,
      movInternosEtiqueta: latamKonfio > 0 ? '+LATAM Konfío' : '+10% Consulting',
      saldoFinal: redondear(techIngresos - techEgresos + movTech),
    },
    {
      unidad: 'grupo',
      etiqueta: 'Grupo',
      saldoInicial: 0,
      ingresos: redondear(grupoIngresosDirectos + aporte10Ytd),
      egresos: grupoEgresos,
      movInternos: 0,
      movInternosEtiqueta: '—',
      saldoFinal: redondear(grupoIngresosDirectos + aporte10Ytd - grupoEgresos),
    },
    {
      unidad: 'caja_bbva',
      etiqueta: 'Caja BBVA',
      saldoInicial: 0,
      ingresos: redondear(consultingIngresos + techIngresos + grupoIngresosDirectos),
      egresos: redondear(consultingEgresos + techEgresos + grupoEgresos),
      movInternos: 0,
      movInternosEtiqueta: '—',
      saldoFinal: redondear(
        consultingIngresos + techIngresos + grupoIngresosDirectos - consultingEgresos - techEgresos - grupoEgresos
      ),
    },
  ];
}
