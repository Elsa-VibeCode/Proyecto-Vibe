const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const ORDEN_CAMPOS = [
  'tiempoPuesto',
  'nivelPuesto',
  'seguroMedico',
  'fechaFacturacion',
  'fechaMovimiento',
  'noFactura',
  'fechaPago',
  'conceptoMovimiento',
  'conceptoFactura',
  'contraparte',
  'areaVenta',
  'subtotal',
  'iva',
  'total',
  'ingreso',
  'egreso',
  'cargo',
  'abono',
  'saldoTotal',
  'saldoConsulting',
  'saldoTechnologies',
  'saldoGrupo',
  'enFacturas',
  'estatusEnvio',
  'estatusPago',
  'colaborador',
  'cliente',
  'unidad',
  'estado',
  'puesto',
  'categoria',
  'sueldo',
  'notas',
];

const PATRONES = {
  fechaFacturacion: ['fecha de facturacion', 'fecha de facturación', 'fecha facturacion'],
  fechaMovimiento: ['fecha'],
  noFactura: ['no.factura', 'no factura', 'numero factura', 'número factura', 'folio factura'],
  fechaPago: ['fecha de pago', 'fecha pago', 'fecha de pago (ingreso)'],
  conceptoMovimiento: ['concepto / cliente', 'concepto (banco)'],
  conceptoFactura: ['concepto'],
  contraparte: ['contraparte / ref.', 'contraparte'],
  areaVenta: ['area de venta', 'área de venta'],
  subtotal: ['subtotal'],
  iva: ['iva'],
  total: ['total con iva', 'total'],
  ingreso: ['ingreso'],
  egreso: ['egreso'],
  cargo: ['cargo'],
  abono: ['abono'],
  saldoTotal: ['saldo total'],
  saldoConsulting: ['saldo consulting'],
  saldoTechnologies: ['saldo technologies'],
  saldoGrupo: ['saldo grupo'],
  enFacturas: ['en facturas', '¿en facturas?'],
  estatusEnvio: ['estatus de envio', 'estatus de envío', 'estatus envio'],
  estatusPago: ['estatus de pago', 'estatus pago'],
  colaborador: ['colaborador', 'empleado', 'nombre completo', 'trabajador'],
  cliente: [
    'cliente',
    'razon social receptor',
    'razón social receptor',
    'razon social',
    'razón social',
    'receptor',
  ],
  unidad: ['unidad', 'unidad de negocio', 'business unit'],
  estado: ['estado', 'estatus', 'status'],
  notas: ['notas', 'nota', 'comentarios', 'observaciones'],
  puesto: ['puesto', 'titulo del puesto', 'título del puesto', 'posicion', 'posición', 'job title', 'rol'],
  nivelPuesto: ['nivel de puesto', 'nivel puesto', 'puesto nivel', 'level', 'grado', 'nivel'],
  categoria: ['categoria', 'categoría', 'category', 'departamento', 'area', 'área', 'division'],
  tiempoPuesto: [
    'tiempo en el puesto',
    'tiempo en puesto',
    'tiempo puesto',
    'antiguedad',
    'antigüedad',
    'años en puesto',
    'meses en puesto',
  ],
  sueldo: ['sueldo', 'salario', 'salary', 'pago mensual', 'compensacion', 'compensación', 'ingreso'],
  seguroMedico: [
    'seguro de gastos medicos',
    'seguro de gastos médicos',
    'seguro medico',
    'seguro médico',
    'gmm',
    'gastos medicos',
    'gastos médicos',
  ],
};

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function esColumnaMes(columna) {
  const norm = normalizar(columna);
  return MESES.includes(norm) || norm === 'total' || /^\d{4}-\d{2}$/.test(norm);
}

export function detectarColumnas(columnas) {
  const mapeo = {
    fechaFacturacion: null,
    fechaMovimiento: null,
    noFactura: null,
    fechaPago: null,
    conceptoFactura: null,
    conceptoMovimiento: null,
    contraparte: null,
    areaVenta: null,
    subtotal: null,
    iva: null,
    total: null,
    ingreso: null,
    egreso: null,
    cargo: null,
    abono: null,
    saldoTotal: null,
    saldoConsulting: null,
    saldoTechnologies: null,
    saldoGrupo: null,
    enFacturas: null,
    estatusEnvio: null,
    estatusPago: null,
    colaborador: null,
    cliente: null,
    unidad: null,
    estado: null,
    notas: null,
    puesto: null,
    nivelPuesto: null,
    categoria: null,
    tiempoPuesto: null,
    sueldo: null,
    seguroMedico: null,
  };

  const usadas = new Set();
  const normalizadas = columnas.map((c) => ({ original: c, norm: normalizar(c) }));

  for (const campo of ORDEN_CAMPOS) {
    for (const patron of PATRONES[campo]) {
      const patronNorm = normalizar(patron);
      const encontrada = normalizadas.find(
        (c) =>
          !usadas.has(c.original) &&
          (c.norm === patronNorm || c.norm.includes(patronNorm))
      );

      if (encontrada) {
        mapeo[campo] = encontrada.original;
        usadas.add(encontrada.original);
        break;
      }
    }
  }

  return mapeo;
}

export function detectarTipoHoja(mapeo, columnas = [], nombreHoja = '') {
  const normHoja = normalizar(nombreHoja);
  const tieneConcepto = columnas.some((c) => normalizar(c) === 'concepto');
  const tieneCategoria = columnas.some((c) => ['categoria', 'categoría'].includes(normalizar(c)));
  const mesesDetectados = columnas.filter((c) => esColumnaMes(c)).length;

  if (normHoja.includes('conciliacion')) return 'conciliacion';

  if (normHoja.includes('aportaciones')) return 'aportaciones-grupo';

  if (tieneConcepto && tieneCategoria && mesesDetectados >= 2) {
    if (normHoja.includes('resumen mensual')) return 'resumen-mensual';
    return 'resumen-mensual';
  }

  if (mapeo.noFactura && mapeo.cliente && (mapeo.subtotal || mapeo.total)) {
    return 'facturacion';
  }

  if (normHoja.includes('estado de cuenta') && normHoja.includes('flujo')) {
    return 'estado-cuenta-flujo';
  }

  if (
    normHoja.includes('estado de cuenta') ||
    (mapeo.ingreso && mapeo.egreso && mapeo.saldoTotal)
  ) {
    return 'estado-cuenta';
  }

  if (mapeo.cargo && mapeo.abono && mapeo.saldoTotal) {
    return 'estado-cuenta-flujo';
  }

  if (mapeo.colaborador && mapeo.unidad) return 'sueldos-unidad';
  if (mapeo.cliente && mapeo.unidad) return 'mapa-unidades';
  if (mapeo.puesto || mapeo.nivelPuesto || mapeo.sueldo) return 'rrhh';
  return 'generico';
}

export function parsearNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = String(valor).trim();
  if (texto.startsWith('#') || texto.toLowerCase() === 'n/a') return null;
  const limpio = texto.replace(/[$,\s]/g, '').trim();
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

export function parsearTiempoMeses(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  const texto = normalizar(String(valor));
  const matchAnios = texto.match(/(\d+(?:\.\d+)?)\s*(años|anos|year|yr)/);
  if (matchAnios) return Math.round(Number(matchAnios[1]) * 12);

  const matchMeses = texto.match(/(\d+(?:\.\d+)?)\s*(meses|mes|month|m)/);
  if (matchMeses) return Math.round(Number(matchMeses[1]));

  const soloNumero = parsearNumero(valor);
  if (soloNumero !== null) {
    return soloNumero <= 50 ? Math.round(soloNumero * 12) : Math.round(soloNumero);
  }

  return null;
}

export function parsearSeguro(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  const texto = normalizar(String(valor));

  if (['si', 'sí', 'yes', 'true', '1', 'activo', 'incluido', 'con seguro'].includes(texto)) {
    return true;
  }

  if (['no', 'false', '0', 'sin seguro', 'no aplica', 'n/a'].includes(texto)) {
    return false;
  }

  return null;
}

function obtenerValor(fila, columna) {
  if (!columna) return null;
  return fila[columna];
}

function extraerTokensColaborador(nombre) {
  const tokens = new Set();
  const parentesis = nombre.match(/\(([^)]+)\)/);
  if (parentesis) {
    normalizar(parentesis[1])
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
      .forEach((t) => tokens.add(t));
  }

  const base = nombre.replace(/\([^)]*\)/g, ' ');
  normalizar(base)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .forEach((t) => tokens.add(t));

  return [...tokens];
}

export function crearMapaColaboradoresUnidad(filas, mapeo) {
  if (!mapeo.colaborador || !mapeo.unidad) return [];

  const unidadesValidas = new Set(['consulting', 'technologies', 'grupo']);
  const entradas = [];

  for (const fila of filas) {
    const nombre = String(obtenerValor(fila, mapeo.colaborador) ?? '').trim();
    const unidad = String(obtenerValor(fila, mapeo.unidad) ?? '').trim();
    const nombreNorm = normalizar(nombre);
    const unidadNorm = normalizar(unidad);

    if (!nombre || !unidad || !unidadesValidas.has(unidadNorm)) continue;
    if (unidad.includes('→') || nombre.includes('→')) continue;
    if (
      /^(reglas|gastos|metodo|abogado|ene|may|gastos bluegreen)/.test(nombreNorm) ||
      nombreNorm.includes('sueldo base')
    ) {
      continue;
    }

    entradas.push({
      nombre,
      unidad,
      tokens: extraerTokensColaborador(nombre),
    });
  }

  return entradas;
}

function textoContieneToken(textoNorm, token) {
  if (!token || token.length < 3) return false;
  const partes = textoNorm.split(/[^a-z0-9]+/).filter(Boolean);
  if (partes.includes(token)) return true;
  if (token.length >= 5 && textoNorm.includes(token)) return true;
  return false;
}

function buscarUnidadPorTexto(texto, mapaColaboradores) {
  const norm = normalizar(texto);
  if (!norm) return null;

  let mejorUnidad = null;
  let mejorScore = 0;

  for (const entrada of mapaColaboradores) {
    const nombreBase = normalizar(entrada.nombre.replace(/\([^)]*\)/g, ' ').trim());
    if (nombreBase.length >= 8 && (norm.includes(nombreBase) || nombreBase.includes(norm))) {
      const score = nombreBase.length + 10;
      if (score > mejorScore) {
        mejorScore = score;
        mejorUnidad = entrada.unidad;
      }
    }

    for (const token of entrada.tokens) {
      if (textoContieneToken(norm, token)) {
        const score = token.length;
        if (score > mejorScore) {
          mejorScore = score;
          mejorUnidad = entrada.unidad;
        }
      }
    }
  }

  return mejorUnidad;
}

export function clasificarUnidadMovimiento(fila, mapeo, mapaColaboradores = []) {
  const unidadOriginal = String(obtenerValor(fila, mapeo.unidad) ?? '').trim() || 'Sin unidad';
  if (!mapeo.unidad || mapaColaboradores.length === 0) return unidadOriginal;

  const concepto = String(obtenerValor(fila, mapeo.conceptoMovimiento) ?? '');
  const contraparte = String(obtenerValor(fila, mapeo.contraparte) ?? '');
  const texto = `${concepto} ${contraparte}`.trim();
  const textoNorm = normalizar(texto);

  if (textoNorm.includes('representacion')) return unidadOriginal;
  if (normalizar(unidadOriginal) !== 'grupo') return unidadOriginal;

  const unidadInferida = buscarUnidadPorTexto(texto, mapaColaboradores);
  if (!unidadInferida || normalizar(unidadInferida) === 'grupo') return unidadOriginal;

  const mencionaNomina = textoNorm.includes('nomina');
  const porConcepto = buscarUnidadPorTexto(concepto, mapaColaboradores);
  const porContraparte = buscarUnidadPorTexto(contraparte, mapaColaboradores);

  if (porConcepto || porContraparte || mencionaNomina) {
    return unidadInferida;
  }

  return unidadOriginal;
}

export function clasificarFilasEstadoCuenta(filas, mapeo, mapaColaboradores = []) {
  if (!mapeo.unidad || mapaColaboradores.length === 0) {
    return { filas, reclasificados: 0 };
  }

  const colUnidad = mapeo.unidad;
  let reclasificados = 0;

  const filasClasificadas = filas.map((fila) => {
    const unidadExcel = String(obtenerValor(fila, colUnidad) ?? '').trim();
    const unidadEfectiva = clasificarUnidadMovimiento(fila, mapeo, mapaColaboradores);

    if (unidadEfectiva !== unidadExcel) {
      reclasificados += 1;
      return { ...fila, [colUnidad]: unidadEfectiva, _unidadOriginal: unidadExcel };
    }

    return fila;
  });

  return { filas: filasClasificadas, reclasificados };
}

function esPagado(estatus) {
  return normalizar(String(estatus ?? '')).includes('pagad');
}

export function filtrarFilas(filas, mapeo, filtros = {}) {
  const sueldoMin = filtros.sueldoMin ? Number(filtros.sueldoMin) : null;
  const sueldoMax = filtros.sueldoMax ? Number(filtros.sueldoMax) : null;
  const totalMin = filtros.totalMin ? Number(filtros.totalMin) : null;
  const totalMax = filtros.totalMax ? Number(filtros.totalMax) : null;
  const tiempoMin = filtros.tiempoMin ? Number(filtros.tiempoMin) : null;
  const tiempoMax = filtros.tiempoMax ? Number(filtros.tiempoMax) : null;

  return filas.filter((fila) => {
    const colaborador = String(obtenerValor(fila, mapeo.colaborador) ?? '').trim();
    const cliente = String(obtenerValor(fila, mapeo.cliente) ?? '').trim();
    const unidad = String(obtenerValor(fila, mapeo.unidad) ?? '').trim();
    const areaVenta = String(obtenerValor(fila, mapeo.areaVenta) ?? '').trim();
    const estatusPago = String(obtenerValor(fila, mapeo.estatusPago) ?? '').trim();
    const estado = String(obtenerValor(fila, mapeo.estado) ?? '').trim();
    const puesto = String(obtenerValor(fila, mapeo.puesto) ?? '').trim();
    const nivel = String(obtenerValor(fila, mapeo.nivelPuesto) ?? '').trim();
    const categoria = String(obtenerValor(fila, mapeo.categoria) ?? '').trim();
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const total = parsearNumero(obtenerValor(fila, mapeo.total));
    const tiempo = parsearTiempoMeses(obtenerValor(fila, mapeo.tiempoPuesto));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    const enFacturas = String(obtenerValor(fila, mapeo.enFacturas) ?? '').trim();
    const ingreso = parsearNumero(obtenerValor(fila, mapeo.ingreso));
    const egreso = parsearNumero(obtenerValor(fila, mapeo.egreso));
    const cargo = parsearNumero(obtenerValor(fila, mapeo.cargo));
    const abono = parsearNumero(obtenerValor(fila, mapeo.abono));

    if (filtros.colaborador && colaborador !== filtros.colaborador) return false;
    if (filtros.cliente && cliente !== filtros.cliente) return false;
    if (filtros.unidad && unidad !== filtros.unidad) return false;
    if (filtros.areaVenta && areaVenta !== filtros.areaVenta) return false;
    if (filtros.estatusPago && estatusPago !== filtros.estatusPago) return false;
    if (filtros.estado && estado !== filtros.estado) return false;
    if (filtros.enFacturas && enFacturas !== filtros.enFacturas) return false;
    if (filtros.estadoClasificacion && fila.estadoClasificacion !== filtros.estadoClasificacion) {
      return false;
    }
    if (filtros.soloSinClasificar === 'true' && fila.estadoClasificacion !== 'no_encontrado') {
      return false;
    }
    if (filtros.puesto && puesto !== filtros.puesto) return false;
    if (filtros.nivelPuesto && nivel !== filtros.nivelPuesto) return false;
    if (filtros.categoria && categoria !== filtros.categoria) return false;
    if (sueldoMin !== null && (sueldo === null || sueldo < sueldoMin)) return false;
    if (sueldoMax !== null && (sueldo === null || sueldo > sueldoMax)) return false;
    if (totalMin !== null && (total === null || total < totalMin)) return false;
    if (totalMax !== null && (total === null || total > totalMax)) return false;
    if (tiempoMin !== null && (tiempo === null || tiempo < tiempoMin)) return false;
    if (tiempoMax !== null && (tiempo === null || tiempo > tiempoMax)) return false;
    if (filtros.seguroMedico === 'si' && seguro !== true) return false;
    if (filtros.seguroMedico === 'no' && seguro !== false) return false;

    return true;
  });
}

export function calcularResumenFacturacion(filas, mapeo) {
  if (!mapeo.total && !mapeo.subtotal) return null;

  const columnaMonto = mapeo.total || mapeo.subtotal;
  let totalFacturado = 0;
  let totalPagado = 0;
  let totalPendiente = 0;
  const porCliente = new Map();
  const porUnidad = new Map();
  const porEstatus = new Map();

  for (const fila of filas) {
    if (fila.excluidoDeTotales) continue;

    const monto = parsearNumero(obtenerValor(fila, columnaMonto)) ?? 0;
    const cliente = String(obtenerValor(fila, mapeo.cliente) ?? 'Sin cliente').trim() || 'Sin cliente';
    const unidad =
      String(fila.unidadClasificada ?? 'sin_clasificar').trim() || 'sin_clasificar';
    const estatus = String(obtenerValor(fila, mapeo.estatusPago) ?? 'Sin estatus').trim() || 'Sin estatus';
    const pagado = mapeo.estatusPago ? esPagado(estatus) : false;

    totalFacturado += monto;
    if (pagado) totalPagado += monto;
    else totalPendiente += monto;

    if (!porCliente.has(cliente)) porCliente.set(cliente, { facturas: 0, monto: 0 });
    const grupoCliente = porCliente.get(cliente);
    grupoCliente.facturas += 1;
    grupoCliente.monto += monto;

    if (!porUnidad.has(unidad)) porUnidad.set(unidad, { facturas: 0, monto: 0 });
    const grupoUnidad = porUnidad.get(unidad);
    grupoUnidad.facturas += 1;
    grupoUnidad.monto += monto;

    if (!porEstatus.has(estatus)) porEstatus.set(estatus, { facturas: 0, monto: 0 });
    const grupoEstatus = porEstatus.get(estatus);
    grupoEstatus.facturas += 1;
    grupoEstatus.monto += monto;
  }

  const ordenar = (entries) =>
    entries
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .sort((a, b) => b.monto - a.monto);

  const porUnidadOrdenado = ordenar([...porUnidad.entries()]).filter(
    (item) => item.nombre !== 'sin_clasificar'
  );

  return {
    totalFacturado: Math.round(totalFacturado),
    totalPagado: Math.round(totalPagado),
    totalPendiente: Math.round(totalPendiente),
    facturas: filas.filter((fila) => !fila.excluidoDeTotales).length,
    porCliente: ordenar([...porCliente.entries()]).slice(0, 10),
    porUnidad: porUnidadOrdenado,
    porArea: porUnidadOrdenado,
    porEstatus: ordenar([...porEstatus.entries()]),
  };
}

export function calcularResumenFinanzas(filas, columnas) {
  const meses = columnas.filter((c) => esColumnaMes(c) && normalizar(c) !== 'total');
  const columnaTotal =
    columnas.find((c) => normalizar(c) === 'total') ?? columnas[columnas.length - 1];

  function buscarConcepto(patron) {
    return filas.find((fila) => normalizar(String(fila.Concepto ?? '')).includes(normalizar(patron)));
  }

  const totalIngresos = buscarConcepto('total ingresos');
  const netoMes = buscarConcepto('neto del mes');
  const netoAcumulado = buscarConcepto('neto acumulado');

  const ingresosPorMes = meses.map((mes) => ({
    mes,
    ingresos: parsearNumero(totalIngresos?.[mes]) ?? 0,
    neto: parsearNumero(netoMes?.[mes]) ?? 0,
  }));

  const maxIngreso = Math.max(...ingresosPorMes.map((m) => m.ingresos), 1);

  const filaConsulting = buscarConcepto('consulting (nomina');
  const filaTechnologies = buscarConcepto('technologies (nomina');
  const filaGrupoOperativo = buscarConcepto('grupo (egresos totales)');

  const egresosPorUnidad = [
    {
      unidad: 'Consulting',
      etiqueta: 'Nómina / distribución',
      fila: filaConsulting,
      total: parsearNumero(filaConsulting?.[columnaTotal]) ?? 0,
      porMes: Object.fromEntries(
        meses.map((mes) => [mes, parsearNumero(filaConsulting?.[mes]) ?? 0])
      ),
    },
    {
      unidad: 'Technologies',
      etiqueta: 'Nómina',
      fila: filaTechnologies,
      total: parsearNumero(filaTechnologies?.[columnaTotal]) ?? 0,
      porMes: Object.fromEntries(
        meses.map((mes) => [mes, parsearNumero(filaTechnologies?.[mes]) ?? 0])
      ),
    },
    {
      unidad: 'Grupo',
      etiqueta: 'Pool de egresos Grupo',
      fila: filaGrupoOperativo,
      total: parsearNumero(filaGrupoOperativo?.[columnaTotal]) ?? 0,
      porMes: Object.fromEntries(
        meses.map((mes) => [mes, parsearNumero(filaGrupoOperativo?.[mes]) ?? 0])
      ),
    },
  ].filter((item) => item.fila);

  return {
    meses,
    columnaTotal,
    totalIngresos: parsearNumero(totalIngresos?.[columnaTotal]) ?? 0,
    netoUltimoMes: parsearNumero(netoMes?.[meses[meses.length - 1]]) ?? 0,
    netoAcumulado: parsearNumero(netoAcumulado?.[columnaTotal]) ?? 0,
    ingresosPorMes: ingresosPorMes.map((item) => ({
      ...item,
      porcentaje: Math.round((item.ingresos / maxIngreso) * 100),
    })),
    egresosPorUnidad,
    conceptos: filas,
  };
}

export function calcularResumenNiveles(filas, mapeo) {
  if (!mapeo.nivelPuesto) return [];

  const grupos = new Map();

  for (const fila of filas) {
    const nivel = String(obtenerValor(fila, mapeo.nivelPuesto) ?? 'Sin nivel').trim() || 'Sin nivel';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (!grupos.has(nivel)) {
      grupos.set(nivel, { sueldos: [], conSeguro: 0, empleados: 0 });
    }

    const grupo = grupos.get(nivel);
    grupo.empleados += 1;
    if (sueldo !== null) grupo.sueldos.push(sueldo);
    if (seguro === true) grupo.conSeguro += 1;
  }

  return [...grupos.entries()]
    .map(([nivel, datos]) => {
      const promedio =
        datos.sueldos.length > 0
          ? datos.sueldos.reduce((a, b) => a + b, 0) / datos.sueldos.length
          : 0;

      return {
        nivel,
        empleados: datos.empleados,
        sueldoPromedio: Math.round(promedio),
        sueldoMin: datos.sueldos.length ? Math.min(...datos.sueldos) : 0,
        sueldoMax: datos.sueldos.length ? Math.max(...datos.sueldos) : 0,
        conSeguro: datos.conSeguro,
      };
    })
    .sort((a, b) => b.sueldoPromedio - a.sueldoPromedio);
}

export function calcularResumenPuestos(filas, mapeo) {
  if (!mapeo.puesto) return [];

  const grupos = new Map();

  for (const fila of filas) {
    const puesto = String(obtenerValor(fila, mapeo.puesto) ?? 'Sin puesto').trim() || 'Sin puesto';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));
    const seguro = parsearSeguro(obtenerValor(fila, mapeo.seguroMedico));

    if (!grupos.has(puesto)) {
      grupos.set(puesto, { sueldos: [], conSeguro: 0, empleados: 0 });
    }

    const grupo = grupos.get(puesto);
    grupo.empleados += 1;
    if (sueldo !== null) grupo.sueldos.push(sueldo);
    if (seguro === true) grupo.conSeguro += 1;
  }

  return [...grupos.entries()]
    .map(([puesto, datos]) => {
      const promedio =
        datos.sueldos.length > 0
          ? datos.sueldos.reduce((a, b) => a + b, 0) / datos.sueldos.length
          : 0;

      return {
        puesto,
        empleados: datos.empleados,
        sueldoPromedio: Math.round(promedio),
        sueldoMin: datos.sueldos.length ? Math.min(...datos.sueldos) : 0,
        sueldoMax: datos.sueldos.length ? Math.max(...datos.sueldos) : 0,
        conSeguro: datos.conSeguro,
      };
    })
    .sort((a, b) => b.sueldoPromedio - a.sueldoPromedio);
}

export function calcularResumenUnidades(filas, mapeo) {
  if (!mapeo.unidad) return [];

  const grupos = new Map();

  for (const fila of filas) {
    const unidad = String(obtenerValor(fila, mapeo.unidad) ?? 'Sin unidad').trim() || 'Sin unidad';
    const sueldo = parsearNumero(obtenerValor(fila, mapeo.sueldo));

    if (!grupos.has(unidad)) {
      grupos.set(unidad, { registros: 0, sueldos: [], pendientes: 0 });
    }

    const grupo = grupos.get(unidad);
    grupo.registros += 1;
    if (sueldo !== null) grupo.sueldos.push(sueldo);

    const estado = normalizar(String(obtenerValor(fila, mapeo.estado) ?? ''));
    if (estado.includes('por confirmar') || estado.includes('pendiente')) {
      grupo.pendientes += 1;
    }
  }

  return [...grupos.entries()]
    .map(([unidad, datos]) => {
      const promedio =
        datos.sueldos.length > 0
          ? datos.sueldos.reduce((a, b) => a + b, 0) / datos.sueldos.length
          : 0;

      return {
        unidad,
        registros: datos.registros,
        sueldoPromedio: Math.round(promedio),
        pendientes: datos.pendientes,
      };
    })
    .sort((a, b) => b.registros - a.registros);
}

function esFilaMovimiento(fila, mapeo) {
  const concepto = normalizar(
    String(obtenerValor(fila, mapeo.conceptoMovimiento) ?? obtenerValor(fila, mapeo.conceptoFactura) ?? '')
  );
  if (
    concepto.includes('saldo inicial') ||
    concepto.includes('saldo de apertura') ||
    concepto.includes('enero 202') ||
    concepto.includes('febrero 202') ||
    concepto.includes('marzo 202')
  ) {
    return false;
  }

  const fecha = obtenerValor(fila, mapeo.fechaMovimiento);
  const ingreso = parsearNumero(obtenerValor(fila, mapeo.ingreso));
  const egreso = parsearNumero(obtenerValor(fila, mapeo.egreso));
  const cargo = parsearNumero(obtenerValor(fila, mapeo.cargo));
  const abono = parsearNumero(obtenerValor(fila, mapeo.abono));

  return Boolean(fecha) || ingreso !== null || egreso !== null || cargo !== null || abono !== null;
}

export function calcularResumenEstadoCuenta(filas, mapeo, esFlujo = false, opciones = {}) {
  const movimientos = filas.filter((fila) => esFilaMovimiento(fila, mapeo));
  if (movimientos.length === 0) return null;

  let totalIngresos = 0;
  let totalEgresos = 0;
  let saldoFinal = 0;
  const porUnidad = new Map();
  let nominaReclasificada = 0;

  for (const fila of movimientos) {
    const unidad = String(obtenerValor(fila, mapeo.unidad) ?? 'Sin unidad').trim() || 'Sin unidad';
    if (fila._unidadOriginal && fila._unidadOriginal !== unidad) {
      nominaReclasificada += 1;
    }
    const ingreso = parsearNumero(obtenerValor(fila, mapeo.ingreso)) ?? 0;
    const egreso = parsearNumero(obtenerValor(fila, mapeo.egreso)) ?? 0;
    const cargo = parsearNumero(obtenerValor(fila, mapeo.cargo)) ?? 0;
    const abono = parsearNumero(obtenerValor(fila, mapeo.abono)) ?? 0;
    const saldo = parsearNumero(obtenerValor(fila, mapeo.saldoTotal));

    const entrada = esFlujo ? abono : ingreso;
    const salida = esFlujo ? cargo : egreso;

    totalIngresos += entrada;
    totalEgresos += salida;
    if (saldo !== null) saldoFinal = saldo;

    if (!porUnidad.has(unidad)) {
      porUnidad.set(unidad, { movimientos: 0, ingresos: 0, egresos: 0 });
    }
    const grupo = porUnidad.get(unidad);
    grupo.movimientos += 1;
    grupo.ingresos += entrada;
    grupo.egresos += salida;
  }

  return {
    movimientos: movimientos.length,
    totalIngresos: Math.round(totalIngresos),
    totalEgresos: Math.round(totalEgresos),
    saldoFinal: Math.round(saldoFinal),
    nominaReclasificada,
    usaMapaSueldos: Boolean(opciones.usaMapaSueldos),
    porUnidad: [...porUnidad.entries()]
      .map(([unidad, datos]) => ({
        unidad,
        movimientos: datos.movimientos,
        ingresos: Math.round(datos.ingresos),
        egresos: Math.round(datos.egresos),
      }))
      .sort((a, b) => b.egresos - a.egresos || b.ingresos - a.ingresos),
  };
}

const MESES_PERIODO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function extraerPeriodoConciliacion(importacion) {
  const periodo = importacion.datosEstructurados?.periodo;
  if (periodo) return String(periodo).trim();

  const nombre = importacion.nombreHoja || '';
  return nombre.replace(/^conciliaci[oó]n\s*/i, '').trim() || nombre;
}

export function indicePeriodoConciliacion(periodo) {
  const norm = normalizar(periodo);
  const idx = MESES_PERIODO.findIndex((mes) => norm === mes || norm.startsWith(mes));
  return idx >= 0 ? idx : 999;
}

export function agruparImportacionesConciliacion(importaciones) {
  const porPeriodo = new Map();

  for (const importacion of importaciones) {
    const periodo = extraerPeriodoConciliacion(importacion);
    const key = normalizar(periodo);

    if (!porPeriodo.has(key)) {
      const resumen = importacion.datosEstructurados?.resumen ?? {};
      porPeriodo.set(key, {
        periodo,
        id: String(importacion._id),
        nombreArchivo: importacion.nombreArchivo,
        nombreHoja: importacion.nombreHoja,
        totalFilas: importacion.totalFilas,
        createdAt: importacion.createdAt,
        saldoFinalBanco: resumen.saldoFinalBanco ?? null,
        diferenciaCargos: resumen.diferenciaCargos ?? null,
        diferenciaAbonos: resumen.diferenciaAbonos ?? null,
      });
    }
  }

  return [...porPeriodo.values()].sort((a, b) => {
    const porMes = indicePeriodoConciliacion(a.periodo) - indicePeriodoConciliacion(b.periodo);
    if (porMes !== 0) return porMes;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function buscarImportacionConciliacion(importaciones, periodoBuscado) {
  const key = normalizar(periodoBuscado);
  return importaciones.find(
    (importacion) => normalizar(extraerPeriodoConciliacion(importacion)) === key
  );
}

export function calcularResumenConciliacion(filas, mapeo, datosEstructurados = null) {
  const resumenBase = datosEstructurados?.resumen ?? {};
  const periodo = datosEstructurados?.periodo ?? '';

  let sinFactura = 0;
  let conFactura = 0;
  let totalCargos = 0;
  let totalAbonos = 0;

  for (const fila of filas) {
    const cargo = parsearNumero(obtenerValor(fila, mapeo.cargo)) ?? 0;
    const abono = parsearNumero(obtenerValor(fila, mapeo.abono)) ?? 0;
    const enFacturas = normalizar(String(obtenerValor(fila, mapeo.enFacturas) ?? ''));

    totalCargos += cargo;
    totalAbonos += abono;

    if (enFacturas === 'si' || enFacturas === 'sí') conFactura += 1;
    else if (enFacturas === 'no') sinFactura += 1;
  }

  return {
    periodo,
    saldoInicialBanco: Math.round(resumenBase.saldoInicialBanco ?? 0),
    abonosBanco: Math.round(resumenBase.abonosBanco ?? 0),
    abonosHoja: Math.round(resumenBase.abonosHoja ?? 0),
    diferenciaAbonos: Math.round(resumenBase.diferenciaAbonos ?? 0),
    cargosBanco: Math.round(resumenBase.cargosBanco ?? 0),
    cargosHoja: Math.round(resumenBase.cargosHoja ?? 0),
    diferenciaCargos: Math.round(resumenBase.diferenciaCargos ?? 0),
    saldoFinalBanco: Math.round(resumenBase.saldoFinalBanco ?? 0),
    movimientos: filas.length,
    conFactura,
    sinFactura,
    totalCargos: Math.round(totalCargos),
    totalAbonos: Math.round(totalAbonos),
  };
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function esColumnaMesOCorto(columna) {
  const norm = normalizar(columna);
  if (['concepto', 'categoria', 'categoría', 'total'].includes(norm)) return false;
  return esColumnaMes(columna) || MESES_CORTOS.some((m) => norm.startsWith(m));
}

function detectarMesActualColumna(columnas) {
  const nombresLargos = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  const ahora = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })
  );
  const mesIdx = ahora.getMonth();
  const largo = nombresLargos[mesIdx];
  const corto = MESES_CORTOS[mesIdx];

  const encontrada = columnas.find((c) => {
    const n = normalizar(c);
    return n.includes(largo) || n.startsWith(corto);
  });

  if (encontrada) return encontrada;

  const meses = columnas.filter((c) => esColumnaMesOCorto(c));
  return meses[meses.length - 1] ?? '';
}

function buscarConcepto(filas, ...patrones) {
  for (const patron of patrones) {
    const fila = filas.find((f) =>
      normalizar(String(f.Concepto ?? '')).includes(normalizar(patron))
    );
    if (fila) return fila;
  }
  return null;
}

function porcentajeDesdeValor(valor) {
  const numero = parsearNumero(valor);
  if (numero === null) return 0;
  return numero <= 1.5 ? Math.round(numero * 100) : Math.round(numero);
}

export function calcularResumenAportacionesGrupo(filas, columnas, nombreHoja = '') {
  const esHistorico = normalizar(nombreHoja).includes('aportaciones');
  const meses = columnas.filter((c) => esColumnaMesOCorto(c));

  const egresosGrupo = buscarConcepto(
    filas,
    'egresos grupo del mes',
    'egresos de grupo a cubrir',
    'egresos de grupo del mes'
  );
  const aporte10Consulting = buscarConcepto(
    filas,
    '10% de facturación consulting',
    '10% de facturacion consulting'
  );
  const gap = buscarConcepto(filas, 'gap =', 'gap');
  const aporteConsulting = buscarConcepto(
    filas,
    'consulting — aportó',
    'consulting - aporto',
    'aporta consulting'
  );
  const aporteTech = buscarConcepto(
    filas,
    'technologies — aportó',
    'technologies - aporto',
    'aporta technologies'
  );
  const consumoGrupo = buscarConcepto(filas, 'grupo — consumió', 'grupo - consumio');
  const porcentajeCobertura = buscarConcepto(filas, '% cobertura');

  const historialMensual = meses.map((mes) => {
    const egresos = parsearNumero(egresosGrupo?.[mes]) ?? 0;
    const consulting = parsearNumero(aporteConsulting?.[mes]) ?? 0;
    const technologies = parsearNumero(aporteTech?.[mes]) ?? 0;
    const aporte10 = parsearNumero(aporte10Consulting?.[mes]) ?? 0;
    const gapValor =
      parsearNumero(gap?.[mes]) ?? Math.max(0, Math.round(egresos - aporte10));
    const consumo = parsearNumero(consumoGrupo?.[mes]) ?? 0;
    const cobertura =
      porcentajeCobertura !== null
        ? porcentajeDesdeValor(porcentajeCobertura?.[mes])
        : egresos > 0
          ? Math.round(((Math.max(0, consulting) + Math.max(0, technologies)) / egresos) * 100)
          : 0;

    const esProyeccion = normalizar(mes).includes('proy');
    const aportesPositivos = Math.max(0, consulting) + Math.max(0, technologies);
    const faltanteReal = Math.max(0, Math.round(egresos - aportesPositivos));
    const faltantePorCubrir =
      esProyeccion && gapValor > 0 ? Math.round(gapValor) : faltanteReal;

    return {
      mes,
      egresosGrupo: Math.round(egresos),
      aporte10Consulting: Math.round(aporte10),
      gapPorCubrir: Math.round(gapValor),
      aporteConsulting: Math.round(consulting),
      aporteTechnologies: Math.round(technologies),
      consumoGrupo: Math.round(Math.abs(consumo)),
      porcentajeCobertura: cobertura,
      faltantePorCubrir,
    };
  });

  const mesActual = detectarMesActualColumna(columnas);
  const actual =
    historialMensual.find((h) => h.mes === mesActual) ??
    historialMensual[historialMensual.length - 1] ??
    null;

  return {
    fuente: esHistorico ? 'aportaciones-historicas' : 'resumen-mensual',
    meses,
    mesActual: actual?.mes ?? mesActual,
    historialMensual,
    actual,
    porUnidad: [
      {
        unidad: 'Consulting',
        color: '#4f46e5',
        historial: historialMensual.map((h) => ({ mes: h.mes, monto: h.aporteConsulting })),
      },
      {
        unidad: 'Technologies',
        color: '#0891b2',
        historial: historialMensual.map((h) => ({ mes: h.mes, monto: h.aporteTechnologies })),
      },
      {
        unidad: 'Grupo',
        color: '#dc2626',
        historial: historialMensual.map((h) => ({ mes: h.mes, monto: h.egresosGrupo })),
      },
    ],
  };
}
