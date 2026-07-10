import { ExcelImport } from '../models/ExcelImport.js';
import { NominaPago } from '../models/NominaPago.js';
import { MapaProveedor } from '../models/MapaProveedor.js';
import { ConfiguracionFlujo } from '../models/ConfiguracionFlujo.js';
import { ResumenMensualFlujo } from '../models/ResumenMensualFlujo.js';
import { asegurarMapaUnidadesDisponible, sembrarMapasSiVacios } from '../services/mapaSync.js';
import { MapaUnidad } from '../models/MapaUnidad.js';
import {
  enriquecerFilasFacturacion,
  crearIndiceMapaProveedores,
  clasificarFilaEgresoProveedor,
} from '../utils/clasificacionMotor.js';
import {
  detectarColumnas,
  parsearNumero,
} from '../utils/excelFiltros.js';
import {
  fechaAPeriodo,
  parsearFecha,
  periodoDesdeTextoNomina,
  ordenarPeriodos,
  advertenciaDatosIncompletos,
  esMesEnCurso,
  etiquetaPeriodo,
  periodoActualMexico,
} from '../utils/periodoFlujo.js';

const UNIDADES_INGRESO = new Set(['Consulting', 'Technologies', 'Grupo']);

function crearMapaMeses() {
  return new Map();
}

function obtenerBucket(meses, periodo) {
  if (!periodo) return null;
  if (!meses.has(periodo)) {
    meses.set(periodo, {
      ingresos: { consulting: 0, technologies: 0, grupo: 0 },
      egresos: { consultingNomina: 0, technologiesNomina: 0, grupoDirecto: 0 },
      registrosPendientes: 0,
      totalRegistrosMes: 0,
    });
  }
  return meses.get(periodo);
}

function esFacturaIncluible(fila) {
  if (fila.excluidoDeTotales) return { incluir: false, pendiente: false };
  if (fila.estadoClasificacion === 'no_encontrado') return { incluir: false, pendiente: true };
  if (fila.unidadClasificada === 'sin_clasificar') return { incluir: false, pendiente: true };
  return { incluir: true, pendiente: false };
}

function esNominaIncluible(pago) {
  if (pago.estadoClasificacion === 'no_encontrado') return { incluir: false, pendiente: true };
  if (pago.unidadClasificada === 'sin_clasificar') return { incluir: false, pendiente: true };
  return { incluir: true, pendiente: false };
}

function esEgresoIncluible(clasificacion) {
  if (clasificacion.estadoClasificacion === 'no_encontrado') return { incluir: false, pendiente: true };
  if (clasificacion.unidadClasificada === 'sin_clasificar') return { incluir: false, pendiente: true };
  return { incluir: true, pendiente: false };
}

function claveUnidadIngreso(unidad) {
  const map = {
    Consulting: 'consulting',
    Technologies: 'technologies',
    Grupo: 'grupo',
  };
  return map[unidad] ?? null;
}

async function obtenerUltimaImportacionGlobal(tipoHoja) {
  return ExcelImport.findOne({ tipoHoja }).sort({ createdAt: -1 }).lean();
}

async function obtenerPagosNominaGlobales() {
  const pagos = await NominaPago.find().sort({ actualizadoEn: -1, creadoEn: -1 }).lean();
  const vistos = new Map();

  for (const pago of pagos) {
    const clave =
      pago.claveOrigen ||
      `${pago.colaborador}|${pago.monto}|${pago.periodo}|${pago.concepto ?? ''}`;
    if (!vistos.has(clave)) vistos.set(clave, pago);
  }

  return [...vistos.values()];
}

function agregarFacturas(meses, filas, mapeo) {
  const columnaMonto = mapeo.total || mapeo.subtotal;
  const columnaFecha = mapeo.fechaFacturacion;

  for (const fila of filas) {
    const periodo = fechaAPeriodo(parsearFecha(columnaFecha ? fila[columnaFecha] : null));
    const bucket = obtenerBucket(meses, periodo);
    if (!bucket) continue;

    bucket.totalRegistrosMes += 1;
    const { incluir, pendiente } = esFacturaIncluible(fila);
    if (pendiente) bucket.registrosPendientes += 1;
    if (!incluir) continue;

    const monto = parsearNumero(columnaMonto ? fila[columnaMonto] : null) ?? 0;
    if (monto <= 0) continue;

    const clave = claveUnidadIngreso(fila.unidadClasificada);
    if (clave && UNIDADES_INGRESO.has(fila.unidadClasificada)) {
      bucket.ingresos[clave] += monto;
    }
  }
}

function agregarNomina(meses, pagos) {
  for (const pago of pagos) {
    const periodo = periodoDesdeTextoNomina(pago.periodo, pago.fecha);
    const bucket = obtenerBucket(meses, periodo);
    if (!bucket) continue;

    bucket.totalRegistrosMes += 1;
    const { incluir, pendiente } = esNominaIncluible(pago);
    if (pendiente) bucket.registrosPendientes += 1;
    if (!incluir) continue;

    const monto = pago.montoClasificadoBase ?? pago.monto ?? 0;
    if (monto <= 0) continue;

    if (pago.unidadClasificada === 'Consulting') {
      bucket.egresos.consultingNomina += monto;
    } else if (pago.unidadClasificada === 'Technologies') {
      bucket.egresos.technologiesNomina += monto;
    }
  }
}

function agregarEgresosGrupo(meses, filas, mapeo, indiceProveedores, esFlujo = false) {
  for (const fila of filas) {
    const columnaFecha = mapeo.fechaMovimiento || mapeo.fechaFacturacion;
    const periodo = fechaAPeriodo(parsearFecha(columnaFecha ? fila[columnaFecha] : null));
    const bucket = obtenerBucket(meses, periodo);
    if (!bucket) continue;

    const egreso = parsearNumero(mapeo.egreso ? fila[mapeo.egreso] : null) ?? 0;
    const cargo = parsearNumero(mapeo.cargo ? fila[mapeo.cargo] : null) ?? 0;
    const salida = esFlujo ? cargo : egreso;
    if (salida <= 0) continue;

    bucket.totalRegistrosMes += 1;
    const clasificacion = clasificarFilaEgresoProveedor(fila, mapeo, indiceProveedores);
    const { incluir, pendiente } = esEgresoIncluible(clasificacion);
    if (pendiente) bucket.registrosPendientes += 1;
    if (!incluir) continue;

    if (clasificacion.unidadClasificada === 'Grupo') {
      bucket.egresos.grupoDirecto += salida;
    }
  }
}

function calcularMes(bucket, config) {
  const ingresos = {
    consulting: Math.round(bucket.ingresos.consulting),
    technologies: Math.round(bucket.ingresos.technologies),
    grupo: Math.round(bucket.ingresos.grupo),
  };

  const egresos = {
    consultingNomina: Math.round(bucket.egresos.consultingNomina),
    technologiesNomina: Math.round(bucket.egresos.technologiesNomina),
    grupoDirecto: Math.round(bucket.egresos.grupoDirecto),
  };

  const resultadoNeto = {
    consulting: ingresos.consulting - egresos.consultingNomina,
    technologies: ingresos.technologies - egresos.technologiesNomina,
    grupo: ingresos.grupo - egresos.grupoDirecto,
    total: 0,
  };
  resultadoNeto.total =
    resultadoNeto.consulting + resultadoNeto.technologies + resultadoNeto.grupo;

  const aportacionOficial = Math.round(
    (config.porcentajeAporteOficial / 100) * ingresos.consulting
  );

  const egresosTotalesACubrir =
    egresos.consultingNomina + egresos.technologiesNomina + egresos.grupoDirecto;

  const porcentajeCoberturaOficial =
    egresosTotalesACubrir > 0
      ? Math.round((aportacionOficial / egresosTotalesACubrir) * 1000) / 10
      : 0;

  return {
    ingresos,
    egresos,
    resultadoNeto,
    aportacionOficial,
    egresosTotalesACubrir,
    porcentajeCoberturaOficial,
    registrosPendientes: bucket.registrosPendientes,
    totalRegistrosMes: bucket.totalRegistrosMes,
  };
}

export async function obtenerOcrearConfiguracion() {
  let config = await ConfiguracionFlujo.findOne({ clave: 'global' });
  if (!config) {
    config = await ConfiguracionFlujo.create({ clave: 'global' });
  }
  return config;
}

export async function actualizarConfiguracionFlujo(datos, usuarioId) {
  const config = await obtenerOcrearConfiguracion();

  if (datos.saldoAperturaConsulting !== undefined) {
    config.saldoAperturaConsulting = Number(datos.saldoAperturaConsulting) || 0;
  }
  if (datos.saldoAperturaTechnologies !== undefined) {
    config.saldoAperturaTechnologies = Number(datos.saldoAperturaTechnologies) || 0;
  }
  if (datos.saldoAperturaGrupo !== undefined) {
    config.saldoAperturaGrupo = Number(datos.saldoAperturaGrupo) || 0;
  }
  if (datos.porcentajeAporteOficial !== undefined) {
    const pct = Number(datos.porcentajeAporteOficial);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new Error('El porcentaje de aporte oficial debe estar entre 0 y 100');
    }
    config.porcentajeAporteOficial = pct;
  }

  config.actualizadoPor = usuarioId;
  await config.save();
  return config;
}

export async function recalcularResumenMensualFlujo(usuarioId = null) {
  const config = await obtenerOcrearConfiguracion();
  const meses = crearMapaMeses();

  await asegurarMapaUnidadesDisponible();
  await sembrarMapasSiVacios(usuarioId);
  const mapaUnidades = await MapaUnidad.find().lean();
  const mapaProveedores = await MapaProveedor.find().lean();
  const indiceProveedores = crearIndiceMapaProveedores(mapaProveedores);

  const importacionFacturacion = await obtenerUltimaImportacionGlobal('facturacion');
  if (importacionFacturacion?.filas?.length) {
    const mapeo = detectarColumnas(importacionFacturacion.columnas);
    const filas = enriquecerFilasFacturacion(importacionFacturacion.filas, mapeo, mapaUnidades);
    agregarFacturas(meses, filas, mapeo);
  }

  const pagosNomina = await obtenerPagosNominaGlobales();
  agregarNomina(meses, pagosNomina);

  const importacionEstadoCuenta = await ExcelImport.findOne({
    tipoHoja: { $in: ['estado-cuenta', 'estado-cuenta-flujo'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (importacionEstadoCuenta?.filas?.length) {
    const mapeo = detectarColumnas(importacionEstadoCuenta.columnas);
    agregarEgresosGrupo(
      meses,
      importacionEstadoCuenta.filas,
      mapeo,
      indiceProveedores,
      importacionEstadoCuenta.tipoHoja === 'estado-cuenta-flujo'
    );
  }

  const periodos = ordenarPeriodos([...meses.keys()]);
  let saldoConsulting = config.saldoAperturaConsulting;
  let saldoTechnologies = config.saldoAperturaTechnologies;
  let saldoGrupo = config.saldoAperturaGrupo;

  const fuentes = {
    facturacion: importacionFacturacion
      ? {
          archivo: importacionFacturacion.nombreArchivo,
          hoja: importacionFacturacion.nombreHoja,
          actualizadoEn: importacionFacturacion.createdAt,
        }
      : null,
    estadoCuenta: importacionEstadoCuenta
      ? {
          archivo: importacionEstadoCuenta.nombreArchivo,
          hoja: importacionEstadoCuenta.nombreHoja,
          tipo: importacionEstadoCuenta.tipoHoja,
          actualizadoEn: importacionEstadoCuenta.createdAt,
        }
      : null,
    nominaPagos: pagosNomina.length,
  };

  let mesesGuardados = 0;

  for (const periodo of periodos) {
    const bucket = meses.get(periodo);
    const calculado = calcularMes(bucket, config);

    saldoConsulting += calculado.resultadoNeto.consulting;
    saldoTechnologies += calculado.resultadoNeto.technologies;
    saldoGrupo += calculado.resultadoNeto.grupo;

    await ResumenMensualFlujo.findOneAndUpdate(
      { periodo },
      {
        periodo,
        ...calculado,
        saldoAcumulado: {
          consulting: Math.round(saldoConsulting),
          technologies: Math.round(saldoTechnologies),
          grupo: Math.round(saldoGrupo),
          total: Math.round(saldoConsulting + saldoTechnologies + saldoGrupo),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    mesesGuardados += 1;
  }

  if (periodos.length > 0) {
    await ResumenMensualFlujo.deleteMany({ periodo: { $nin: periodos } });
  }

  if (usuarioId) {
    config.actualizadoPor = usuarioId;
    await config.save();
  }

  return {
    mesesGuardados,
    periodos,
    fuentes,
    configuracion: config.toObject(),
  };
}

export async function obtenerResumenFlujo() {
  const config = await obtenerOcrearConfiguracion();
  const meses = await ResumenMensualFlujo.find().sort({ periodo: 1 }).lean();

  const historial = meses.map((mes) => ({
    ...mes,
    etiqueta: etiquetaPeriodo(mes.periodo),
    mesEnCurso: esMesEnCurso(mes.periodo),
    advertenciaIncompleto: advertenciaDatosIncompletos(
      mes.registrosPendientes,
      mes.totalRegistrosMes
    ),
  }));

  const periodoActual = periodoActualMexico();
  const mesActual =
    historial.find((m) => m.periodo === periodoActual) ??
    historial[historial.length - 1] ??
    null;

  const aportacionAcumulada = historial.reduce((acc, m) => acc + (m.aportacionOficial ?? 0), 0);
  const egresosAcumulados = historial.reduce(
    (acc, m) => acc + (m.egresosTotalesACubrir ?? 0),
    0
  );

  return {
    configuracion: {
      saldoAperturaConsulting: config.saldoAperturaConsulting,
      saldoAperturaTechnologies: config.saldoAperturaTechnologies,
      saldoAperturaGrupo: config.saldoAperturaGrupo,
      porcentajeAporteOficial: config.porcentajeAporteOficial,
      actualizadoEn: config.actualizadoEn,
    },
    historialMensual: historial,
    mesActual: mesActual?.periodo ?? periodoActual,
    resumenActual: mesActual,
    totales: {
      aportacionOficialAcumulada: aportacionAcumulada,
      egresosTotalesACubrirAcumulados: egresosAcumulados,
      porcentajeCoberturaAcumulado:
        egresosAcumulados > 0
          ? Math.round((aportacionAcumulada / egresosAcumulados) * 1000) / 10
          : 0,
    },
    necesitaRecalculo: historial.length === 0,
  };
}
