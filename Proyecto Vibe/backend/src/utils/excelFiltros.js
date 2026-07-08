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
  'noFactura',
  'fechaPago',
  'conceptoFactura',
  'areaVenta',
  'subtotal',
  'iva',
  'total',
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
  noFactura: ['no.factura', 'no factura', 'numero factura', 'número factura', 'folio factura'],
  fechaPago: ['fecha de pago', 'fecha pago', 'fecha de pago (ingreso)'],
  conceptoFactura: ['concepto'],
  areaVenta: ['area de venta', 'área de venta'],
  subtotal: ['subtotal'],
  iva: ['iva'],
  total: ['total con iva', 'total'],
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
  puesto: ['puesto', 'cargo', 'titulo del puesto', 'título del puesto', 'posicion', 'posición', 'job title', 'rol'],
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
    noFactura: null,
    fechaPago: null,
    conceptoFactura: null,
    areaVenta: null,
    subtotal: null,
    iva: null,
    total: null,
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

export function detectarTipoHoja(mapeo, columnas = []) {
  const tieneConcepto = columnas.some((c) => normalizar(c) === 'concepto');
  const tieneCategoria = columnas.some((c) => ['categoria', 'categoría'].includes(normalizar(c)));
  const mesesDetectados = columnas.filter((c) => esColumnaMes(c)).length;

  if (tieneConcepto && tieneCategoria && mesesDetectados >= 2) {
    return 'resumen-mensual';
  }

  if (mapeo.noFactura && mapeo.cliente && (mapeo.subtotal || mapeo.total)) {
    return 'facturacion';
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

    if (filtros.colaborador && colaborador !== filtros.colaborador) return false;
    if (filtros.cliente && cliente !== filtros.cliente) return false;
    if (filtros.unidad && unidad !== filtros.unidad) return false;
    if (filtros.areaVenta && areaVenta !== filtros.areaVenta) return false;
    if (filtros.estatusPago && estatusPago !== filtros.estatusPago) return false;
    if (filtros.estado && estado !== filtros.estado) return false;
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
  const porArea = new Map();
  const porEstatus = new Map();

  for (const fila of filas) {
    const monto = parsearNumero(obtenerValor(fila, columnaMonto)) ?? 0;
    const cliente = String(obtenerValor(fila, mapeo.cliente) ?? 'Sin cliente').trim() || 'Sin cliente';
    const area = String(obtenerValor(fila, mapeo.areaVenta) ?? 'Sin área').trim() || 'Sin área';
    const estatus = String(obtenerValor(fila, mapeo.estatusPago) ?? 'Sin estatus').trim() || 'Sin estatus';
    const pagado = mapeo.estatusPago ? esPagado(estatus) : false;

    totalFacturado += monto;
    if (pagado) totalPagado += monto;
    else totalPendiente += monto;

    if (!porCliente.has(cliente)) porCliente.set(cliente, { facturas: 0, monto: 0 });
    const grupoCliente = porCliente.get(cliente);
    grupoCliente.facturas += 1;
    grupoCliente.monto += monto;

    if (!porArea.has(area)) porArea.set(area, { facturas: 0, monto: 0 });
    const grupoArea = porArea.get(area);
    grupoArea.facturas += 1;
    grupoArea.monto += monto;

    if (!porEstatus.has(estatus)) porEstatus.set(estatus, { facturas: 0, monto: 0 });
    const grupoEstatus = porEstatus.get(estatus);
    grupoEstatus.facturas += 1;
    grupoEstatus.monto += monto;
  }

  const ordenar = (entries) =>
    entries
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .sort((a, b) => b.monto - a.monto);

  return {
    totalFacturado: Math.round(totalFacturado),
    totalPagado: Math.round(totalPagado),
    totalPendiente: Math.round(totalPendiente),
    facturas: filas.length,
    porCliente: ordenar([...porCliente.entries()]).slice(0, 10),
    porArea: ordenar([...porArea.entries()]),
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
