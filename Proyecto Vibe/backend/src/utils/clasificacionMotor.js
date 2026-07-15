const UNIDADES_VALIDAS = new Set(['consulting', 'technologies', 'grupo']);
const ALIAS_UNIDAD = {
  strategy: 'Consulting',
  consulting: 'Consulting',
  technologies: 'Technologies',
  grupo: 'Grupo',
};

export function normalizarClave(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarUnidad(unidad) {
  const norm = normalizarClave(unidad);
  if (ALIAS_UNIDAD[norm]) return ALIAS_UNIDAD[norm];
  if (norm === 'consulting' || norm.includes('consulting')) return 'Consulting';
  if (norm === 'technologies' || norm.includes('technolog')) return 'Technologies';
  if (norm === 'grupo') return 'Grupo';
  return String(unidad ?? '').trim() || 'sin_clasificar';
}

export function crearIndiceMapaUnidades(entradas = []) {
  const indice = new Map();

  for (const entrada of entradas) {
    const key = entrada.clienteRazonSocialNormalizado || normalizarClave(entrada.clienteRazonSocial);
    if (key) indice.set(key, entrada);
  }

  return indice;
}

export function crearIndiceMapaProveedores(entradas = []) {
  const indice = new Map();

  for (const entrada of entradas) {
    const key = entrada.razonSocialNormalizado || normalizarClave(entrada.razonSocial);
    if (key) indice.set(key, entrada);
    if (entrada.rfcEmisor) {
      indice.set(normalizarClave(entrada.rfcEmisor), entrada);
    }
  }

  return indice;
}

function obtenerValor(fila, columna) {
  if (!columna) return null;
  return fila[columna];
}

export function esRegistroCancelado(fila, mapeo) {
  const campos = [mapeo.estatusPago, mapeo.estatusEnvio].filter(Boolean);

  for (const columna of campos) {
    const valor = normalizarClave(obtenerValor(fila, columna));
    if (valor.includes('cancelad')) return true;
  }

  return false;
}

export function clasificarFilaFacturacion(fila, mapeo, indiceUnidades) {
  const cliente = String(obtenerValor(fila, mapeo.cliente) ?? '').trim();
  const excluidoDeTotales = esRegistroCancelado(fila, mapeo);

  if (!cliente) {
    return {
      unidadClasificada: 'sin_clasificar',
      estadoClasificacion: 'no_encontrado',
      excluidoDeTotales,
    };
  }

  const entrada = indiceUnidades.get(normalizarClave(cliente));

  if (!entrada) {
    return {
      unidadClasificada: 'sin_clasificar',
      estadoClasificacion: 'no_encontrado',
      excluidoDeTotales,
    };
  }

  const unidad = normalizarUnidad(entrada.unidad);
  const estadoClasificacion =
    entrada.estado === 'confirmado' ? 'auto_confirmado' : 'por_confirmar';

  return {
    unidadClasificada: unidad,
    estadoClasificacion,
    excluidoDeTotales,
  };
}

export function enriquecerFilasFacturacion(filas, mapeo, mapaUnidades = []) {
  const indice = crearIndiceMapaUnidades(mapaUnidades);

  return filas.map((fila) => {
    const clasificacion = clasificarFilaFacturacion(fila, mapeo, indice);
    return { ...fila, ...clasificacion };
  });
}

export function clasificarFilaEgresoProveedor(fila, mapeo, indiceProveedores) {
  const contraparte = String(
    (mapeo.contraparte ? fila[mapeo.contraparte] : null) ??
      (mapeo.conceptoMovimiento ? fila[mapeo.conceptoMovimiento] : null) ??
      (mapeo.conceptoFactura ? fila[mapeo.conceptoFactura] : null) ??
      ''
  ).trim();

  if (!contraparte) {
    return {
      unidadClasificada: 'sin_clasificar',
      estadoClasificacion: 'no_encontrado',
    };
  }

  const clave = normalizarClave(contraparte);
  let entrada = indiceProveedores.get(clave);

  if (!entrada) {
    for (const [key, valor] of indiceProveedores.entries()) {
      if (clave.includes(key) || key.includes(clave)) {
        entrada = valor;
        break;
      }
    }
  }

  if (!entrada) {
    return {
      unidadClasificada: 'sin_clasificar',
      estadoClasificacion: 'no_encontrado',
    };
  }

  const estadoClasificacion =
    entrada.estado === 'confirmado' ? 'auto_confirmado' : 'por_confirmar';

  return {
    unidadClasificada: normalizarUnidad(entrada.unidad),
    estadoClasificacion,
  };
}

export function resumenClasificacionFacturacion(filas) {
  const resumen = {
    total: filas.length,
    autoConfirmado: 0,
    porConfirmar: 0,
    manual: 0,
    noEncontrado: 0,
    cancelados: 0,
    activos: 0,
  };

  for (const fila of filas) {
    if (fila.excluidoDeTotales) resumen.cancelados += 1;
    else resumen.activos += 1;

    if (fila.estadoClasificacion === 'auto_confirmado') resumen.autoConfirmado += 1;
    else if (fila.estadoClasificacion === 'por_confirmar') resumen.porConfirmar += 1;
    else if (fila.estadoClasificacion === 'manual') resumen.manual = (resumen.manual ?? 0) + 1;
    else if (fila.estadoClasificacion === 'no_encontrado') resumen.noEncontrado += 1;
  }

  return resumen;
}
