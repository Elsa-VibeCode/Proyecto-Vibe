import { obtenerConfig } from '../../models/Config.js';
import {
  calcularTotalesPorUnidad as calcularFacturas,
  reservaAcumuladaTechnologies,
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
import { obtenerCachePanel, guardarCachePanel } from './panelCache.js';

function formatearActualizadoEn() {
  return new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export async function obtenerPanel(mesParam, { refrescar = false } = {}) {
  const mes = esMesValido(mesParam) ? mesParam : mesActualSistema();

  if (!refrescar) {
    const cached = obtenerCachePanel(mes);
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
    calcularFacturas(mes),
    calcularEgresos(mes),
    egresosGrupoMes(mes),
    reservaAcumuladaTechnologies(mes),
  ]);

  const reglaDetalle = calcularReglaAporte({
    mes,
    config: configDoc,
    consultingPagado: facturas.consulting.pagado,
    egresosGrupo,
  });

  const aporte10pct = reglaDetalle.aporteEsperado;
  const recibe10pct = reglaDetalle.reglaAplica ? aporte10pct : 0;
  const cobertura = await coberturaGrupo(mes, recibe10pct);
  const deficitMes = redondear(Math.max(0, egresosGrupo - recibe10pct));

  const [alertas, chart6meses, chart12meses, saldos, saldosYtd, facturasPrev, egresosGrupoPrev] =
    await Promise.all([
      detectarAlertas(mes),
      datos6Meses(mes),
      datos12Meses(mes),
      evolucionMensual(mes, reglaDetalle),
      evolucionYtd(mes, config.aporteConsultingPct, config.reglaAplica),
      calcularFacturas(mesAnterior(mes)),
      egresosGrupoMes(mesAnterior(mes)),
    ]);

  const sinDatos =
    facturas.totalFacturas === 0 && egresos.count === 0;

  const payload = {
    mes,
    actualizadoEn: formatearActualizadoEn(),
    sinDatos,
    config,
    regla10: reglaDetalle,
    unidades: {
      consulting: {
        facturado: facturas.consulting.facturado,
        pagado: facturas.consulting.pagado,
        pendiente: facturas.consulting.pendiente,
        aporte10pct,
        numFacturas: facturas.consulting.numFacturas,
        numPagadas: facturas.consulting.numPagadas,
        numPendientes: facturas.consulting.numPendientes,
        pctPagado: facturas.consulting.pctPagado,
        deltaFacturadoMesAnterior: deltaPorcentual(
          facturas.consulting.facturado,
          facturasPrev.consulting.facturado
        ),
      },
      technologies: {
        facturado: facturas.technologies.facturado,
        facturadoBBVA: facturas.technologies.facturadoBBVA,
        facturadoFueraBBVA: facturas.technologies.facturadoFueraBBVA,
        pagado: facturas.technologies.pagado,
        pendiente: facturas.technologies.pendiente,
        recibe10pct,
        reservaAcumulada,
        numFacturas: facturas.technologies.numFacturas,
        numPagadas: facturas.technologies.numPagadas,
        numPendientes: facturas.technologies.numPendientes,
        pctPagado: facturas.technologies.pctPagado,
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

  guardarCachePanel(mes, payload);
  return payload;
}

export { invalidarCachePanel, invalidarCachePanelPorMeses } from './panelCache.js';
