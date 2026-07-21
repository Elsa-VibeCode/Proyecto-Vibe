import fs from 'node:fs/promises';
import path from 'node:path';
import { Factura, mesDesdeFecha } from '../models/Factura.js';
import { MapaUnidad } from '../models/MapaUnidad.js';
import { FILTRO_ACTIVAS, normalizarMetodoPago } from './facturaService.js';
import {
  parsearArchivoSicofi,
  sugerirMapping,
} from './sicofiImportService.js';
import {
  normalizarClave,
  crearIndiceMapaUnidades,
} from '../utils/clasificacionMotor.js';

function valorColumna(fila, col) {
  if (!col) return '';
  return fila[col] ?? '';
}

function buscarColumna(columnas, ...aliases) {
  const mapa = new Map(columnas.map((c) => [normalizarClave(c), c]));
  for (const alias of aliases) {
    const hit = mapa.get(normalizarClave(alias));
    if (hit) return hit;
  }
  for (const col of columnas) {
    const n = normalizarClave(col);
    for (const alias of aliases) {
      if (n.includes(normalizarClave(alias))) return col;
    }
  }
  return null;
}

function esTipoComprobanteP(valor) {
  const t = normalizarClave(valor);
  if (!t) return false;
  if (t === 'p') return true;
  if (t.startsWith('p ') || t === 'p.') return true;
  if (t.includes('complemento') && t.includes('pago')) return true;
  return false;
}

function mesDesdeFechaTexto(fechaStr) {
  const s = String(fechaStr ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 2000) {
    return d.toISOString().slice(0, 7);
  }
  return '';
}

function redondearTotal(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function extraerClavesCliente(nombre) {
  const claves = new Set();
  const raw = String(nombre ?? '').trim();
  if (!raw) return claves;

  claves.add(normalizarClave(raw));

  const parentesis = raw.match(/\(([^)]+)\)/);
  if (parentesis) {
    claves.add(normalizarClave(parentesis[1]));
  }

  const sinParentesis = raw.replace(/\([^)]*\)/g, ' ').trim();
  if (sinParentesis !== raw) {
    claves.add(normalizarClave(sinParentesis));
  }

  const dba = raw.match(/\bdba\s+(.+)$/i);
  if (dba) {
    claves.add(normalizarClave(dba[1]));
  }

  return claves;
}

function clientesEquivalentes(fCliente, kRazonSocial, indiceMapa) {
  const clavesF = extraerClavesCliente(fCliente);
  const clavesK = extraerClavesCliente(kRazonSocial);
  if (!clavesF.size || !clavesK.size) return false;

  for (const c of clavesF) {
    if (clavesK.has(c)) return true;
  }

  const a = normalizarClave(fCliente);
  const b = normalizarClave(kRazonSocial);
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;

  const entradaF = indiceMapa.get(a);
  const entradaK = indiceMapa.get(b);
  if (entradaF && entradaK) {
    return String(entradaF._id) === String(entradaK._id);
  }

  if (entradaF) {
    const clavesEntrada = extraerClavesCliente(entradaF.clienteRazonSocial);
    for (const c of clavesK) {
      if (clavesEntrada.has(c)) return true;
    }
  }
  if (entradaK) {
    const clavesEntrada = extraerClavesCliente(entradaK.clienteRazonSocial);
    for (const c of clavesF) {
      if (clavesEntrada.has(c)) return true;
    }
  }

  for (const [, entrada] of indiceMapa) {
    const clavesEntrada = extraerClavesCliente(entrada.clienteRazonSocial);
    const fMatch = [...clavesF].some((c) => clavesEntrada.has(c));
    const kMatch = [...clavesK].some((c) => clavesEntrada.has(c));
    if (fMatch && kMatch) return true;
  }

  return false;
}

function detectarFormato(columnas) {
  const colTipoPago = buscarColumna(columnas, 'tipo_pago', 'tipo pago');
  const colFolioFactura = buscarColumna(columnas, 'folio_factura');
  if (colTipoPago && colFolioFactura) {
    return {
      tipo: 'konfio',
      colTipoPago,
      colUuid: colFolioFactura,
      colTipoFactura: buscarColumna(columnas, 'tipo_factura', 'tipo factura'),
      colRfcEmisor: buscarColumna(columnas, 'rfc_emisor', 'rfc emisor'),
      colStatus: buscarColumna(columnas, 'status', 'estatus'),
      colCliente: buscarColumna(columnas, 'razon_social_receptor', 'razon social receptor'),
      colTotal: buscarColumna(columnas, 'total'),
      colFecha: buscarColumna(columnas, 'fecha'),
    };
  }

  const { mapping } = sugerirMapping(columnas);
  if (!mapping.metodoPago) {
    return { tipo: 'desconocido', mapping };
  }
  return { tipo: 'sicofi', mapping };
}

function esFilaIngresoSicofi(fila, mapping) {
  const tipo = mapping.tipoComprobante
    ? valorColumna(fila, mapping.tipoComprobante)
    : '';
  if (!tipo) return true;
  return !esTipoComprobanteP(tipo);
}

function noFacturaDesdeFilaSicofi(fila, mapping) {
  if (mapping.serie && mapping.folio) {
    const serie = String(valorColumna(fila, mapping.serie)).trim();
    const folio = String(valorColumna(fila, mapping.folio)).trim();
    if (!folio) return '';
    return serie ? `${serie}-${folio}` : folio;
  }
  const col =
    mapping.noFacturaTipo === 'columna' ? mapping.folio || mapping.noFactura : mapping.noFactura;
  return String(valorColumna(fila, col)).trim();
}

function prepararFilasKonfio(filas, columnas, fmt) {
  const vistos = new Map();
  const RFC_EMISOR_GBL = 'gbl200124hn4';

  for (const fila of filas) {
    const uuid = String(valorColumna(fila, fmt.colUuid)).trim().toLowerCase();
    if (!uuid) continue;

    const tipoFactura = fmt.colTipoFactura
      ? normalizarClave(valorColumna(fila, fmt.colTipoFactura))
      : 'ingreso';
    if (tipoFactura && tipoFactura !== 'ingreso') continue;

    const rfcEmisor = fmt.colRfcEmisor
      ? normalizarClave(valorColumna(fila, fmt.colRfcEmisor))
      : '';
    if (rfcEmisor && rfcEmisor !== RFC_EMISOR_GBL) continue;

    const metodo = normalizarMetodoPago(valorColumna(fila, fmt.colTipoPago));
    if (!metodo) continue;

    const fechaRaw = fmt.colFecha ? valorColumna(fila, fmt.colFecha) : '';
    const total = fmt.colTotal ? redondearTotal(valorColumna(fila, fmt.colTotal)) : null;
    const mes = mesDesdeFechaTexto(fechaRaw);
    const cliente = fmt.colCliente ? String(valorColumna(fila, fmt.colCliente)).trim() : '';

    if (vistos.has(uuid)) continue;
    vistos.set(uuid, {
      uuid,
      metodo,
      cliente,
      total,
      mes,
      fecha: fechaRaw,
      status: fmt.colStatus ? valorColumna(fila, fmt.colStatus) : '',
    });
  }

  return [...vistos.values()];
}

function prepararFilasSicofi(filas, mapping) {
  const out = [];
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (!esFilaIngresoSicofi(fila, mapping)) continue;

    const metodo = normalizarMetodoPago(valorColumna(fila, mapping.metodoPago));
    if (!metodo) continue;

    out.push({
      filaNum: i + 2,
      uuid: String(valorColumna(fila, mapping.uuid)).trim().toLowerCase(),
      noFactura: noFacturaDesdeFilaSicofi(fila, mapping),
      metodo,
    });
  }
  return out;
}

function crearIndiceFallback(facturas) {
  const indice = new Map();
  for (const f of facturas) {
    const mes = f.mes || mesDesdeFecha(f.fechaFacturacion);
    const total = redondearTotal(f.total);
    if (!mes || total == null) continue;
    const key = `${mes}|${total}`;
    if (!indice.has(key)) indice.set(key, []);
    indice.get(key).push(f);
  }
  return indice;
}

function buscarPorFallback(reg, indiceFallback, indiceMapa) {
  const { total, mes, cliente } = reg;
  if (total == null || !mes || !cliente) return { factura: null, ambiguo: false };

  const key = `${mes}|${total}`;
  const candidatos = indiceFallback.get(key) ?? [];
  const matches = candidatos.filter((f) =>
    clientesEquivalentes(f.cliente, cliente, indiceMapa)
  );

  if (matches.length === 1) return { factura: matches[0], ambiguo: false };
  if (matches.length > 1) return { factura: null, ambiguo: true };
  return { factura: null, ambiguo: false };
}

async function aplicarRegistros(registros, facturas, { dryRun = false, indiceMapa = null } = {}) {
  const porFolio = new Map(facturas.map((f) => [f.noFactura, f]));
  const porUuid = new Map(
    facturas.filter((f) => f.uuid).map((f) => [String(f.uuid).toLowerCase(), f])
  );
  const indiceFallback = indiceMapa ? crearIndiceFallback(facturas) : null;

  const resumen = {
    omitidasTipoP: 0,
    sinMetodoEnCsv: 0,
    sinMatchEnDb: 0,
    sinCambio: 0,
    actualizadasPue: 0,
    actualizadasPpd: 0,
    matchPorUuid: 0,
    matchPorFallback: 0,
    ambiguoFallback: 0,
    sinMatch: [],
  };

  for (const reg of registros) {
    const { uuid, noFactura, metodo, filaNum } = reg;
    let factura = null;
    let matchTipo = null;

    if (uuid && porUuid.get(uuid)) {
      factura = porUuid.get(uuid);
      matchTipo = 'uuid';
    } else if (noFactura && porFolio.get(noFactura)) {
      factura = porFolio.get(noFactura);
      matchTipo = 'folio';
    } else if (indiceFallback && indiceMapa) {
      const { factura: fb, ambiguo } = buscarPorFallback(reg, indiceFallback, indiceMapa);
      if (ambiguo) {
        resumen.ambiguoFallback += 1;
        if (resumen.sinMatch.length < 30) {
          resumen.sinMatch.push({
            fila: filaNum ?? uuid,
            noFactura,
            uuid,
            metodo,
            motivo: 'ambiguo',
            cliente: reg.cliente,
            total: reg.total,
            mes: reg.mes,
          });
        }
        continue;
      }
      if (fb) {
        factura = fb;
        matchTipo = 'fallback';
      }
    }

    if (!factura) {
      resumen.sinMatchEnDb += 1;
      if (resumen.sinMatch.length < 30) {
        resumen.sinMatch.push({ fila: filaNum ?? uuid, noFactura, uuid, metodo });
      }
      continue;
    }

    if (matchTipo === 'uuid') resumen.matchPorUuid += 1;
    else if (matchTipo === 'fallback') resumen.matchPorFallback += 1;

    const uuidBackfill = uuid && !factura.uuid;

    if (factura.metodoPago === metodo && !uuidBackfill) {
      resumen.sinCambio += 1;
      continue;
    }

    if (!dryRun) {
      const doc = await Factura.findById(factura._id);
      if (doc) {
        if (doc.metodoPago !== metodo) doc.metodoPago = metodo;
        if (uuidBackfill) doc.uuid = uuid;
        await doc.save();
        factura.metodoPago = doc.metodoPago;
        factura.estatusComplemento = doc.estatusComplemento;
        if (uuidBackfill) factura.uuid = doc.uuid;
      }
    } else {
      if (factura.metodoPago !== metodo) {
        factura.metodoPago = metodo;
        if (metodo === 'PUE' || metodo === 'NA') {
          factura.estatusComplemento = 'no_aplica';
        } else if (['PAGADO', 'PARCIAL'].includes(factura.estatusPago)) {
          factura.estatusComplemento =
            Number(factura.montoPagado) > 0 ? 'parcial' : 'pendiente';
        }
      }
      if (uuidBackfill) factura.uuid = uuid;
    }

    if (metodo === 'PPD') resumen.actualizadasPpd += 1;
    else resumen.actualizadasPue += 1;
  }

  return resumen;
}

export async function aplicarMetodoPagoDesdeSicofi(archivoPath, { dryRun = false } = {}) {
  const buffer = await fs.readFile(archivoPath);
  const nombre = path.basename(archivoPath);
  const { filas, columnas } = parsearArchivoSicofi(buffer, nombre);
  const formato = detectarFormato(columnas);

  if (formato.tipo === 'desconocido') {
    throw new Error(
      'Formato no reconocido. Usa export Sicofi con "Método de pago" o export Konfio con columna TIPO_PAGO (PUE/PPD).'
    );
  }

  const facturas = await Factura.find(FILTRO_ACTIVAS)
    .select(
      'noFactura uuid metodoPago estatusPago fechaPago cliente total mes fechaFacturacion estatusComplemento montoPagado'
    )
    .lean();

  let registros;
  let fuente;
  let indiceMapa = null;

  if (formato.tipo === 'konfio') {
    const entradas = await MapaUnidad.find().lean();
    indiceMapa = crearIndiceMapaUnidades(entradas);
    registros = prepararFilasKonfio(filas, columnas, formato);
    fuente = 'Konfio (TIPO_PAGO + UUID, fallback total+mes+cliente)';
  } else {
    registros = prepararFilasSicofi(filas, formato.mapping);
    fuente = 'Sicofi';
  }

  const parcial = await aplicarRegistros(registros, facturas, { dryRun, indiceMapa });

  const ppdPagadas = facturas
    .filter(
      (f) =>
        f.metodoPago === 'PPD' && ['PAGADO', 'PARCIAL'].includes(f.estatusPago)
    )
    .sort((a, b) => {
      const da = a.fechaPago ? new Date(a.fechaPago).getTime() : 0;
      const db = b.fechaPago ? new Date(b.fechaPago).getTime() : 0;
      return da - db;
    })
    .map((f) => ({
      noFactura: f.noFactura,
      cliente: f.cliente,
      total: f.total,
      fechaPago: f.fechaPago ? new Date(f.fechaPago).toISOString().slice(0, 10) : '',
      estatusPago: f.estatusPago,
      estatusComplemento: f.estatusComplemento,
    }));

  const aunNa = dryRun
    ? facturas.filter((f) => f.metodoPago === 'NA').length
    : await Factura.countDocuments({ ...FILTRO_ACTIVAS, metodoPago: 'NA' });

  return {
    archivo: nombre,
    fuente,
    filasCsv: filas.length,
    registrosUnicos: registros.length,
    ...parcial,
    revisarManual: ppdPagadas,
    aunNa,
  };
}

export function imprimirReporte(resumen, { dryRun = false } = {}) {
  console.log('\n=== Import metodoPago (PUE/PPD) ===');
  console.log(`Archivo: ${resumen.archivo}${dryRun ? ' [dry-run]' : ''}`);
  console.log(`Fuente: ${resumen.fuente}`);
  console.log(`Filas CSV: ${resumen.filasCsv}`);
  console.log(`Registros únicos a procesar: ${resumen.registrosUnicos}`);
  if (resumen.matchPorUuid != null) {
    console.log(`Match por UUID: ${resumen.matchPorUuid}`);
    console.log(`Match por fallback (total+mes+cliente): ${resumen.matchPorFallback}`);
    console.log(`Ambiguos en fallback: ${resumen.ambiguoFallback}`);
  }
  console.log(`Sin match en AdminSys: ${resumen.sinMatchEnDb}`);
  console.log(`Sin cambio (ya tenían el mismo valor): ${resumen.sinCambio}`);
  console.log(`Actualizadas → PUE: ${resumen.actualizadasPue}`);
  console.log(`Actualizadas → PPD: ${resumen.actualizadasPpd}`);
  console.log(`Siguen en NA (revisar): ${resumen.aunNa}`);

  if (resumen.sinMatch?.length) {
    console.log('\n--- Primeros UUID/folios sin factura en AdminSys ---');
    for (const s of resumen.sinMatch) {
      const extra = s.motivo === 'ambiguo' ? ` [ambiguo: ${s.cliente} $${s.total} ${s.mes}]` : '';
      console.log(`  ${s.fila}: ${s.noFactura || s.uuid || '?'} → ${s.metodo}${extra}`);
    }
    const sinLista = resumen.sinMatchEnDb + (resumen.ambiguoFallback ?? 0) - resumen.sinMatch.length;
    if (sinLista > 0) {
      console.log(`  ... y ${sinLista} más`);
    }
  }

  console.log('\n--- Revisar manualmente: PPD + pagadas (requieren REP si pendiente) ---');
  if (!resumen.revisarManual.length) {
    console.log('  (ninguna)');
  } else {
    for (const f of resumen.revisarManual) {
      console.log(
        `  ${f.noFactura} · ${f.cliente} · $${Number(f.total).toLocaleString('es-MX')} · pago ${f.fechaPago || '—'} · complemento: ${f.estatusComplemento}`
      );
    }
  }
  console.log('');
}
