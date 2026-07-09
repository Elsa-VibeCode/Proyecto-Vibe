import { normalizarClave } from './clasificacionMotor.js';
import { MONTO_ADMINISTRACION_ELSA } from '../data/seedColaboradoresData.js';

const MESES_MAP = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

export function buscarColaboradorPorTexto(texto, indice) {
  const norm = normalizarClave(texto);
  if (!norm) return null;

  if (indice.porClave.has(norm)) return indice.porClave.get(norm);

  for (const [clave, col] of indice.porClave.entries()) {
    if (norm.includes(clave) || clave.includes(norm)) return col;
  }

  const partes = norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  for (const parte of partes) {
    if (indice.porToken.has(parte)) return indice.porToken.get(parte);
  }

  return null;
}

function esGastoRepresentacion(concepto) {
  const norm = normalizarClave(concepto);
  return norm.includes('representacion') || norm.includes('representación');
}

function esHonorariosAbogado(concepto, colaborador) {
  const norm = normalizarClave(concepto);
  if (norm.includes('abogado')) return true;
  if (colaborador?.tipoRelacion === 'honorarios_externos') return true;
  if (normalizarClave(colaborador?.nombre ?? '').includes('roberto fuentes')) return true;
  return false;
}

function esAdministracionElsa(concepto, colaborador, monto) {
  const norm = normalizarClave(concepto);
  const esElsa = normalizarClave(colaborador?.nombre ?? '').includes('elsa');
  if (!esElsa) return false;
  if (norm.includes('administracion') || norm.includes('administración')) return true;
  if (monto === MONTO_ADMINISTRACION_ELSA) return true;
  return false;
}

function esGastoBlueGreen(concepto, fecha) {
  const norm = normalizarClave(concepto);
  if (!norm.includes('bluegreen') && !norm.includes('blue green')) return false;
  const mes = fecha.getMonth() + 1;
  const anio = fecha.getFullYear();
  if (anio > 2026 || (anio === 2026 && mes > 5)) return false;
  return true;
}

function unidadBlueGreen(concepto) {
  const norm = normalizarClave(concepto);
  if (norm.includes('volkswagen') || norm.includes('camioneta')) return 'Consulting';
  return 'Grupo';
}

function reglaVigente(colaborador, fecha) {
  const reglas = [...(colaborador.reglasSueldo ?? [])].sort(
    (a, b) => new Date(a.vigenciaDesde) - new Date(b.vigenciaDesde)
  );
  const ts = fecha.getTime();

  for (let i = reglas.length - 1; i >= 0; i -= 1) {
    const regla = reglas[i];
    const desde = new Date(regla.vigenciaDesde).getTime();
    const hasta = regla.vigenciaHasta ? new Date(regla.vigenciaHasta).getTime() : null;
    if (ts >= desde && (hasta === null || ts <= hasta)) return regla;
  }

  return null;
}

function clasificarEmpleadoOExterno(colaborador) {
  if (colaborador.tipoRelacion === 'honorarios_externos') {
    return {
      unidadClasificada: 'Grupo',
      estadoClasificacion: 'auto_confirmado',
      montoClasificadoBase: null,
      montoExcedente: 0,
    };
  }

  return {
    unidadClasificada: colaborador.unidadBase,
    estadoClasificacion: 'auto_confirmado',
    montoClasificadoBase: null,
    montoExcedente: 0,
  };
}

function clasificarConRegla(colaborador, monto, regla) {
  const unidad = colaborador.unidadBase;

  if (!regla) {
    return {
      unidadClasificada: unidad,
      estadoClasificacion: 'excede_tope_revisar',
      montoClasificadoBase: 0,
      montoExcedente: monto,
    };
  }

  if (regla.tipo === 'por_proyecto') {
    return {
      unidadClasificada: unidad,
      estadoClasificacion: 'excede_tope_revisar',
      montoClasificadoBase: 0,
      montoExcedente: monto,
    };
  }

  const tope = regla.montoTope ?? monto;
  if (monto <= tope) {
    return {
      unidadClasificada: unidad,
      estadoClasificacion: 'auto_confirmado',
      montoClasificadoBase: monto,
      montoExcedente: 0,
    };
  }

  return {
    unidadClasificada: unidad,
    estadoClasificacion: 'excede_tope_revisar',
    montoClasificadoBase: tope,
    montoExcedente: Math.round((monto - tope) * 100) / 100,
  };
}

export function clasificarPagoNomina(pago, indice) {
  const monto = Number(pago.monto);
  const fecha = pago.fecha instanceof Date ? pago.fecha : new Date(pago.fecha);
  const concepto = String(pago.concepto ?? '');
  const nombreColaborador = String(pago.colaborador ?? '').trim();

  if (!Number.isFinite(monto) || monto <= 0) {
    return resultadoSinClasificar();
  }

  const colaborador = buscarColaboradorPorTexto(nombreColaborador, indice);

  if (esGastoRepresentacion(concepto)) {
    return {
      colaboradorId: colaborador?._id ?? null,
      unidadClasificada: 'Grupo',
      estadoClasificacion: colaborador ? 'auto_confirmado' : 'no_encontrado',
      montoClasificadoBase: monto,
      montoExcedente: 0,
    };
  }

  if (esGastoBlueGreen(concepto, fecha)) {
    return {
      colaboradorId: colaborador?._id ?? null,
      unidadClasificada: unidadBlueGreen(concepto),
      estadoClasificacion: 'auto_confirmado',
      montoClasificadoBase: monto,
      montoExcedente: 0,
    };
  }

  if (!colaborador) {
    return resultadoSinClasificar();
  }

  if (esHonorariosAbogado(concepto, colaborador)) {
    return {
      colaboradorId: colaborador._id,
      unidadClasificada: 'Grupo',
      estadoClasificacion: 'auto_confirmado',
      montoClasificadoBase: monto,
      montoExcedente: 0,
    };
  }

  if (esAdministracionElsa(concepto, colaborador, monto)) {
    return {
      colaboradorId: colaborador._id,
      unidadClasificada: 'Technologies',
      estadoClasificacion: 'auto_confirmado',
      montoClasificadoBase: monto,
      montoExcedente: 0,
    };
  }

  if (colaborador.tipoRelacion === 'empleado' || colaborador.tipoRelacion === 'honorarios_externos') {
    const base = clasificarEmpleadoOExterno(colaborador);
    return { colaboradorId: colaborador._id, ...base, montoClasificadoBase: monto };
  }

  const regla = reglaVigente(colaborador, fecha);
  const resultado = clasificarConRegla(colaborador, monto, regla);
  return { colaboradorId: colaborador._id, ...resultado };
}

function resultadoSinClasificar() {
  return {
    colaboradorId: null,
    unidadClasificada: 'sin_clasificar',
    estadoClasificacion: 'no_encontrado',
    montoClasificadoBase: 0,
    montoExcedente: 0,
  };
}

export function enriquecerPagoNomina(pago, indice) {
  const clasificacion = clasificarPagoNomina(pago, indice);
  const montoBase =
    clasificacion.montoClasificadoBase === null
      ? pago.monto
      : clasificacion.montoClasificadoBase;

  return {
    ...pago,
    ...clasificacion,
    montoClasificadoBase: montoBase,
  };
}

export function resumenClasificacionNomina(pagos) {
  const resumen = {
    total: pagos.length,
    autoConfirmado: 0,
    excedeTopeRevisar: 0,
    noEncontrado: 0,
    montoTotal: 0,
    montoPorUnidad: { Consulting: 0, Technologies: 0, Grupo: 0, sin_clasificar: 0 },
    montoExcedente: 0,
  };

  for (const pago of pagos) {
    resumen.montoTotal += pago.monto;
    if (pago.estadoClasificacion === 'auto_confirmado') resumen.autoConfirmado += 1;
    else if (pago.estadoClasificacion === 'excede_tope_revisar') resumen.excedeTopeRevisar += 1;
    else if (pago.estadoClasificacion === 'no_encontrado') resumen.noEncontrado += 1;

    const base = pago.montoClasificadoBase ?? 0;
    const unidad = pago.unidadClasificada ?? 'sin_clasificar';
    if (resumen.montoPorUnidad[unidad] !== undefined) {
      resumen.montoPorUnidad[unidad] += base;
    }
    resumen.montoExcedente += pago.montoExcedente ?? 0;
  }

  for (const k of Object.keys(resumen.montoPorUnidad)) {
    resumen.montoPorUnidad[k] = Math.round(resumen.montoPorUnidad[k]);
  }
  resumen.montoTotal = Math.round(resumen.montoTotal);
  resumen.montoExcedente = Math.round(resumen.montoExcedente);

  return resumen;
}

export function calcularResumenNominaMensual(pagos) {
  const mesesSet = new Set();
  const filas = {
    Consulting: {},
    Technologies: {},
    Grupo: {},
    sin_clasificar: {},
  };

  for (const pago of pagos) {
    const mes = periodoAMesEtiqueta(pago.periodo, pago.fecha);
    mesesSet.add(mes);
    const unidad = pago.unidadClasificada ?? 'sin_clasificar';
    const monto = pago.montoClasificadoBase ?? 0;
    if (!filas[unidad]) filas[unidad] = {};
    filas[unidad][mes] = (filas[unidad][mes] ?? 0) + monto;
  }

  const meses = [...mesesSet].sort(ordenarMesEtiqueta);
  const porUnidad = ['Consulting', 'Technologies', 'Grupo', 'sin_clasificar'].map((unidad) => {
    const porMes = {};
    let total = 0;
    for (const mes of meses) {
      const valor = Math.round(filas[unidad]?.[mes] ?? 0);
      porMes[mes] = valor;
      total += valor;
    }
    return {
      unidad: unidad === 'sin_clasificar' ? 'Sin clasificar' : unidad,
      porMes,
      total,
    };
  });

  const totalPorMes = {};
  let granTotal = 0;
  for (const mes of meses) {
    const suma = porUnidad.reduce((acc, f) => acc + (f.porMes[mes] ?? 0), 0);
    totalPorMes[mes] = suma;
    granTotal += suma;
  }

  return { meses, porUnidad, totalPorMes, granTotal };
}

export function periodoAMesEtiqueta(periodo, fecha) {
  const match = String(periodo ?? '').match(/(\d{4})-(\d{2})/);
  if (match) {
    const mesNum = Number(match[2]);
    const nombre = Object.entries(MESES_MAP).find(([, n]) => n === mesNum)?.[0];
    if (nombre && nombre.length > 3) return capitalizar(nombre);
    return `Mes ${mesNum}`;
  }

  const norm = normalizarClave(periodo);
  for (const [nombre, num] of Object.entries(MESES_MAP)) {
    if (norm.includes(nombre)) return capitalizar(nombre.length > 3 ? nombre : Object.keys(MESES_MAP).find((k) => MESES_MAP[k] === num && k.length > 3) ?? nombre);
  }

  if (fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
  const mesesLargos = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return mesesLargos[d.getMonth()] ?? 'Sin mes';
  }

  return 'Sin mes';
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function ordenarMesEtiqueta(a, b) {
  const orden = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return orden.indexOf(a) - orden.indexOf(b);
}

export function parsearPeriodoDesdeEncabezado(texto, anioDefault = 2026) {
  const norm = normalizarClave(texto);
  const mesEntry = Object.entries(MESES_MAP).find(([nombre]) => norm.includes(nombre));
  const quincena = norm.includes('q2') ? 'Q2' : 'Q1';
  if (mesEntry) {
    const mes = String(mesEntry[1]).padStart(2, '0');
    return `${anioDefault}-${mes}-${quincena}`;
  }
  return `${anioDefault}-01-${quincena}`;
}

export function fechaDesdePeriodo(periodo) {
  const match = String(periodo).match(/(\d{4})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, 15);
  }
  return new Date();
}
