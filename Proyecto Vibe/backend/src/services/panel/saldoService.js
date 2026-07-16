import { Factura } from '../../models/Factura.js';
import { Egreso } from '../../models/Egreso.js';
import { FILTRO_ACTIVAS } from '../facturaService.js';
import { redondear, mesAnterior } from './mesUtils.js';

async function ingresosPagadosUnidad(unidad, hastaMes) {
  const unidadFiltro =
    unidad === 'consulting'
      ? { $in: ['Consulting', 'Strategy'] }
      : unidad === 'technologies'
        ? 'Technologies'
        : unidad === 'grupo'
          ? 'Grupo'
          : null;

  if (!unidadFiltro) return 0;

  const facturas = await Factura.find({
    ...FILTRO_ACTIVAS,
    mes: { $lte: hastaMes },
    unidad: unidadFiltro,
    estatusPago: 'PAGADO',
    estatusEnvio: { $ne: 'CANCELADA' },
  })
    .select('total')
    .lean();

  return redondear(facturas.reduce((acc, f) => acc + (Number(f.total) || 0), 0));
}

async function egresosUnidad(unidad, hastaMes) {
  const map = { consulting: 'Consulting', technologies: 'Technologies', grupo: 'Grupo' };
  const u = map[unidad];
  if (!u) return 0;

  const rows = await Egreso.aggregate([
    { $match: { mes: { $lte: hastaMes }, unidad: u } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  return redondear(rows[0]?.suma ?? 0);
}

async function saldoAcumuladoHasta(unidad, mesAnteriorAlPeriodo) {
  const ingresos = await ingresosPagadosUnidad(unidad, mesAnteriorAlPeriodo);
  const egresos = await egresosUnidad(unidad, mesAnteriorAlPeriodo);
  return redondear(ingresos - egresos);
}

export async function evolucionMensual(mes, regla) {
  const mesPrev = (() => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  })();

  const aporte10 = regla.reglaAplica ? regla.aporteEsperado : 0;

  const consultingIngresos = await ingresosPagadosUnidad('consulting', mes);
  const techIngresos = await ingresosPagadosUnidad('technologies', mes);
  const grupoIngresosDirectos = await ingresosPagadosUnidad('grupo', mes);

  const consultingEgresos = await egresosUnidad('consulting', mes);
  const techEgresos = await egresosUnidad('technologies', mes);
  const grupoEgresos = await egresosUnidad('grupo', mes);

  const latamRows = await Egreso.aggregate([
    { $match: { mes, unidad: 'Technologies', esTransferLatam: true } },
    { $group: { _id: null, suma: { $sum: '$total' } } },
  ]);
  const latamKonfio = redondear(latamRows[0]?.suma ?? 0);

  const saldoInicialConsulting = await saldoAcumuladoHasta('consulting', mesPrev);
  const saldoInicialTech = await saldoAcumuladoHasta('technologies', mesPrev);
  const saldoInicialGrupo = await saldoAcumuladoHasta('grupo', mesPrev);

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
      saldoFinal: redondear(
        saldoInicialGrupo + grupoIngresosDirectos + aporte10 - grupoEgresos
      ),
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

export async function evolucionYtd(mes, reglaAportePct, reglaAplicaFn) {
  const [y] = mes.split('-');
  const inicioAnio = `${y}-01`;
  const rangoMes = { $gte: inicioAnio, $lte: mes };

  async function sumFacturasPagadas(unidad) {
    const unidadFiltro =
      unidad === 'consulting'
        ? { $in: ['Consulting', 'Strategy'] }
        : unidad === 'technologies'
          ? 'Technologies'
          : 'Grupo';
    const rows = await Factura.aggregate([
      {
        $match: {
          ...FILTRO_ACTIVAS,
          mes: rangoMes,
          unidad: unidadFiltro,
          estatusPago: 'PAGADO',
          estatusEnvio: { $ne: 'CANCELADA' },
        },
      },
      { $group: { _id: null, suma: { $sum: '$total' } } },
    ]);
    return redondear(rows[0]?.suma ?? 0);
  }

  async function sumEgresos(unidad) {
    const map = { consulting: 'Consulting', technologies: 'Technologies', grupo: 'Grupo' };
    const rows = await Egreso.aggregate([
      { $match: { mes: rangoMes, unidad: map[unidad] } },
      { $group: { _id: null, suma: { $sum: '$total' } } },
    ]);
    return redondear(rows[0]?.suma ?? 0);
  }

  const consultingIngresos = await sumFacturasPagadas('consulting');
  const techIngresos = await sumFacturasPagadas('technologies');
  const grupoIngresosDirectos = await sumFacturasPagadas('grupo');

  const consultingEgresos = await sumEgresos('consulting');
  const techEgresos = await sumEgresos('technologies');
  const grupoEgresos = await sumEgresos('grupo');

  const aporte10Ytd = reglaAplicaFn
    ? redondear(consultingIngresos * reglaAportePct)
    : 0;

  const latamRows = await Egreso.aggregate([
    { $match: { mes: rangoMes, unidad: 'Technologies', esTransferLatam: true } },
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
