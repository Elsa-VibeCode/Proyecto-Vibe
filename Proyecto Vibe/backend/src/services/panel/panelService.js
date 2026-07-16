import { obtenerConfig } from '../../models/Config.js';
import {
  calcularTotalesPorUnidad as calcularFacturas,
  reservaAcumuladaTechnologies,
  consultingBaseRegla10,
} from './facturaPanelService.js';
import {
  calcularTotalesPorUnidad as calcularEgresos,
  egresosGrupoMes,
  coberturaGrupo,
} from './egresoPanelService.js';
import { calcularReglaAporte } from './reglaAporteService.js';
import { detectarAlertas } from './alertaService.js';
import { evolucionMensual, evolucionYtd } from './saldoService.js';
import { datos6Meses, datos12Meses } from './chartService.js';
import {
  mesActualSistema,
  esMesValido,
  reglaAplicaEnMes,
  redondear,
  mesAnterior,
  deltaPorcentual,
} from './mesUtils.js';
import { normalizarVista } from './vistaUtils.js';
import { obtenerCachePanel, guardarCachePanel } from './panelCache.js';

function formatearActualizadoEn() {
  return new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function mapUnidadConsulting(u, aporte10pct) {
  return {
    facturado: u.facturado,
    pagado: u.pagado,
    pendiente: u.pendiente,
    aporte10pct,
    numFacturas: u.numFacturas,
    numPagadas: u.numPagadas,
    numPendientes: u.numPendientes,
    pctPagado: u.pctPagado,
    arrastres: u.arrastres ?? null,
  };
}

function mapUnidadTech(u, recibe10pct, reservaAcumulada) {
  return {
    facturado: u.facturado,
    facturadoBBVA: u.facturadoBBVA,
    facturadoFueraBBVA: u.facturadoFueraBBVA,
    pagado: u.pagado,
    pendiente: u.pendiente,
    recibe10pct,
    reservaAcumulada,
    numFacturas: u.numFacturas,
    numPagadas: u.numPagadas,
    numPendientes: u.numPendientes,
    pctPagado: u.pctPagado,
    arrastres: u.arrastres ?? null,
  };
}

export async function obtenerPanel(mesParam, { refrescar = false, vista: vistaParam = 'cobro' } = {}) {
  const mes = esMesValido(mesParam) ? mesParam : mesActualSistema();
  const vista = normalizarVista(vistaParam);

  if (!refrescar) {
    const cached = obtenerCachePanel(mes, vista);
    if (cached) return cached;
  }

  const configDoc = await obtenerConfig();
  const config = {
    aporteConsultingPct: configDoc.aporteConsultingPct,
    fechaVigenciaRegla: configDoc.fechaVigenciaRegla,
    latamKonfioMensual: configDoc.latamKonfioMensual,
    reglaAplica: reglaAplicaEnMes(mes, configDoc.fechaVigenciaRegla),
  };

  const [facturas, egresos, egresosGrupo, reservaAcumulada] = await Promise.all([
    calcularFacturas(mes, vista),
    calcularEgresos(mes),
    egresosGrupoMes(mes),
    reservaAcumuladaTechnologies(mes, vista),
  ]);

  const consultingBase = consultingBaseRegla10(facturas, vista);
  const reglaDetalle = calcularReglaAporte({
    mes,
    config: configDoc,
    consultingPagado: consultingBase,
    egresosGrupo,
  });

  const aporte10pct = reglaDetalle.aporteEsperado;
  const recibe10pct = reglaDetalle.reglaAplica ? aporte10pct : 0;
  const cobertura = await coberturaGrupo(mes, recibe10pct);
  const deficitMes = redondear(Math.max(0, egresosGrupo - recibe10pct));

  const [alertas, chart6meses, chart12meses, saldos, saldosYtd, facturasPrev, egresosGrupoPrev] =
    await Promise.all([
      detectarAlertas(mes, vista),
      datos6Meses(mes, vista),
      datos12Meses(mes, vista),
      evolucionMensual(mes, reglaDetalle, vista),
      evolucionYtd(mes, config.aporteConsultingPct, config.reglaAplica, vista),
      calcularFacturas(mesAnterior(mes), vista),
      egresosGrupoMes(mesAnterior(mes)),
    ]);

  const sinDatos = facturas.totalFacturas === 0 && egresos.count === 0;

  const payload = {
    mes,
    vista,
    actualizadoEn: formatearActualizadoEn(),
    sinDatos,
    config,
    regla10: reglaDetalle,
    unidades: {
      consulting: {
        ...mapUnidadConsulting(facturas.consulting, aporte10pct),
        deltaFacturadoMesAnterior: deltaPorcentual(
          facturas.consulting.facturado,
          facturasPrev.consulting.facturado
        ),
      },
      technologies: {
        ...mapUnidadTech(facturas.technologies, recibe10pct, reservaAcumulada),
        deltaFacturadoMesAnterior: deltaPorcentual(
          facturas.technologies.facturado,
          facturasPrev.technologies.facturado
        ),
      },
      grupo: {
        egresosTotal: egresosGrupo,
        recibio10pct: recibe10pct,
        deficitMes,
        cobertura: {
          consulting: cobertura.consulting,
          technologies: cobertura.technologies,
        },
        deltaEgresosMesAnterior: deltaPorcentual(egresosGrupo, egresosGrupoPrev),
      },
    },
    alertas,
    chart6meses,
    chart12meses,
    saldos,
    saldosYtd,
    desdeCache: false,
  };

  guardarCachePanel(mes, vista, payload);
  return payload;
}

export { invalidarCachePanel, invalidarCachePanelPorMeses } from './panelCache.js';
