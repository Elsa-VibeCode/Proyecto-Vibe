import { ComplementoPago } from '../models/ComplementoPago.js';
import { Factura } from '../models/Factura.js';
import { FILTRO_ACTIVAS } from './facturaService.js';
import {
  parsearArchivoSicofi,
  sugerirMapping,
  parsearFechaCsv,
  parsearNumeroCsv,
  normalizarCliente,
} from './sicofiImportService.js';
import { crearComplemento } from './complementoPagoService.js';

function normalizarClave(texto) {
  return String(texto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function valorColumna(fila, col) {
  if (!col) return '';
  return fila[col] ?? '';
}

function esTipoP(fila, mapping) {
  let tipo = mapping.tipoComprobante ? valorColumna(fila, mapping.tipoComprobante) : '';
  if (!tipo) {
    for (const col of Object.keys(fila)) {
      const nk = normalizarClave(col);
      if (nk.includes('tipo') && (nk.includes('comprobante') || nk.includes('cfdi'))) {
        tipo = fila[col];
        break;
      }
    }
  }
  const t = normalizarClave(tipo);
  return t === 'p' || t.startsWith('p ') || (t.includes('complemento') && t.includes('pago'));
}

function esFormatoReportePagos(columnas) {
  const normalizadas = columnas.map(normalizarClave);
  const tiene = (fragmentos) =>
    normalizadas.some((col) => fragmentos.every((f) => col.includes(f)));
  return (
    tiene(['fecha', 'pago']) &&
    tiene(['imp', 'pagado']) &&
    normalizadas.includes('serie_1') &&
    normalizadas.includes('uuid')
  );
}

/** Sicofi "Reporte Pagos" (.xlsx): fila par REP + fila detalle (UUID factura en Serie_1). */
function parsearFilasReportePagos(filas) {
  const registros = [];

  for (let i = 0; i < filas.length; i++) {
    const header = filas[i];
    const uuid = String(valorColumna(header, 'UUID')).trim().toLowerCase();
    if (!uuid) continue;

    const filaHeader = i + 2;
    const detail = filas[i + 1] ?? {};
    i += 1;

    const uuidFacturaRel = String(valorColumna(detail, 'Serie_1')).trim().toLowerCase();
    const serieFact = String(valorColumna(detail, 'Folio_1')).trim();
    const folioFact = String(valorColumna(detail, 'MonedaDR')).trim();
    const noFacturaRel =
      serieFact && folioFact ? `${serieFact}-${folioFact}` : '';

    const serieRep = String(valorColumna(header, 'Serie')).trim();
    const folioRep = String(valorColumna(header, 'Folio')).trim();
    const folio = serieRep && folioRep ? `${serieRep}-${folioRep}` : folioRep;

    const monto =
      parsearNumeroCsv(valorColumna(detail, 'ImpPagado')) ??
      parsearNumeroCsv(valorColumna(header, 'NumOperacion')) ??
      parsearNumeroCsv(valorColumna(header, 'Monto'));

    const fechaPago = parsearFechaCsv(valorColumna(header, 'Fecha Pago'));
    const cliente = normalizarCliente(valorColumna(header, 'RFC Receptor'));

    registros.push({
      fila: filaHeader,
      uuid,
      folio,
      cliente,
      fechaEmision: fechaPago,
      fechaPago,
      monto,
      uuidFacturaRel: uuidFacturaRel || '',
      noFacturaRel,
    });
  }

  return registros;
}

function construirIndiceFacturas(facturas) {
  const porUuid = new Map();
  const porFolio = new Map();

  for (const factura of facturas) {
    if (factura.uuid) porUuid.set(String(factura.uuid).toLowerCase(), factura);
    porFolio.set(factura.noFactura, factura);
    const m = String(factura.noFactura).match(/^GBL-(\d+)$/i);
    if (m) {
      porFolio.set(`GB.-${m[1]}`, factura);
      porFolio.set(`GBL.${m[1]}`, factura);
    }
  }

  return { porUuid, porFolio };
}

function buscarFacturaEnIndice({ uuidFacturaRel, noFacturaRel }, indice) {
  if (uuidFacturaRel && indice.porUuid.has(uuidFacturaRel)) {
    return indice.porUuid.get(uuidFacturaRel);
  }
  if (!noFacturaRel) return null;

  const variantes = [noFacturaRel];
  const m = noFacturaRel.match(/^GBL-(\d+)$/i);
  if (m) variantes.push(`GB.-${m[1]}`, `GBL.${m[1]}`);

  for (const folio of variantes) {
    if (indice.porFolio.has(folio)) return indice.porFolio.get(folio);
  }
  return null;
}

async function buscarFacturaRelacionada({ uuidFacturaRel, noFacturaRel }, indice = null) {
  if (indice) return buscarFacturaEnIndice({ uuidFacturaRel, noFacturaRel }, indice);

  if (uuidFacturaRel) {
    const porUuid = await Factura.findOne({
      ...FILTRO_ACTIVAS,
      uuid: uuidFacturaRel,
    }).lean();
    if (porUuid) return porUuid;
  }

  if (!noFacturaRel) return null;

  const variantes = [noFacturaRel];
  const m = noFacturaRel.match(/^GBL-(\d+)$/i);
  if (m) variantes.push(`GB.-${m[1]}`, `GBL.${m[1]}`);

  for (const folio of variantes) {
    const hit = await Factura.findOne({ ...FILTRO_ACTIVAS, noFactura: folio }).lean();
    if (hit) return hit;
  }

  return null;
}

function buscarColumnaRelacionada(columnas) {
  const alias = [
    'uuid relacionado',
    'uuid factura relacionada',
    'uuid de la factura relacionada',
    'uuid factura',
    'folio fiscal relacionado',
    'cfdi relacionado',
  ];
  for (const col of columnas) {
    const nk = normalizarClave(col);
    if (alias.some((a) => nk.includes(a.replace(/\s+/g, ' ')))) return col;
  }
  for (const col of columnas) {
    const nk = normalizarClave(col);
    if (nk.includes('uuid') && nk.includes('relacion')) return col;
  }
  return null;
}

function filaARepPreview(fila, mapping, colUuidRel, filaNum) {
  if (!esTipoP(fila, mapping)) {
    return { skip: true, motivo: 'No es complemento de pago (tipo P)' };
  }

  const uuid = String(valorColumna(fila, mapping.uuid)).trim().toLowerCase();
  if (!uuid) {
    return { error: true, fila: filaNum, mensaje: 'Falta UUID del complemento' };
  }

  const fechaEmision = parsearFechaCsv(valorColumna(fila, mapping.fechaFacturacion));
  const fechaPago = parsearFechaCsv(
    valorColumna(fila, mapping.fechaPago || mapping.fechaFacturacion)
  );
  const monto = parsearNumeroCsv(valorColumna(fila, mapping.total));
  if (!fechaEmision || !fechaPago || monto === null || monto <= 0) {
    return { error: true, fila: filaNum, mensaje: 'Fecha o monto inválido' };
  }

  const folio = String(
    valorColumna(fila, mapping.folio || mapping.noFactura) || ''
  ).trim();
  const cliente = normalizarCliente(valorColumna(fila, mapping.cliente));
  const uuidFacturaRel = colUuidRel
    ? String(valorColumna(fila, colUuidRel)).trim().toLowerCase()
    : '';

  return {
    preview: {
      fila: filaNum,
      uuid,
      folio,
      cliente,
      fechaEmision,
      fechaPago,
      monto,
      uuidFacturaRel,
    },
  };
}

async function enriquecerPreviewRep(registros, uuidsExistentes) {
  const preview = [];
  const contadores = { NUEVO: 0, DUPLICADO: 0, ERROR: 0, SKIP: 0, SIN_FACTURA: 0 };
  const facturas = await Factura.find(FILTRO_ACTIVAS).select('_id noFactura uuid cliente unidad').lean();
  const indiceFacturas = construirIndiceFacturas(facturas);

  for (const reg of registros) {
    if (!reg.uuid) {
      contadores.ERROR += 1;
      preview.push({
        fila: reg.fila,
        badge: 'ERROR',
        mensaje: 'Falta UUID del complemento',
      });
      continue;
    }

    if (!reg.fechaPago || !reg.monto || reg.monto <= 0) {
      contadores.ERROR += 1;
      preview.push({
        fila: reg.fila,
        badge: 'ERROR',
        mensaje: 'Fecha o monto inválido',
      });
      continue;
    }

    if (uuidsExistentes.has(reg.uuid)) {
      contadores.DUPLICADO += 1;
      preview.push({ ...reg, badge: 'DUPLICADO' });
      continue;
    }

    const factura = buscarFacturaEnIndice(reg, indiceFacturas);
    if (!factura) contadores.SIN_FACTURA += 1;
    else contadores.NUEVO += 1;

    preview.push({
      ...reg,
      badge: factura ? 'NUEVO' : 'SIN_FACTURA',
      facturaId: factura?._id,
      noFacturaRel: factura?.noFactura ?? reg.noFacturaRel,
    });
  }

  return { preview, contadores };
}

export async function construirPreviewRep(buffer, nombreArchivo = '') {
  const { columnas, filas, encoding } = parsearArchivoSicofi(buffer, nombreArchivo);
  const uuidsExistentes = new Set(
    (await ComplementoPago.find({ uuid: { $ne: '' } }).select('uuid').lean()).map((c) => c.uuid)
  );

  if (esFormatoReportePagos(columnas)) {
    const registros = parsearFilasReportePagos(filas);
    const { preview, contadores } = await enriquecerPreviewRep(registros, uuidsExistentes);

    return {
      columnas,
      mapping: { formato: 'reporte_pagos_sicofi' },
      encoding,
      colUuidRelacionado: 'Serie_1',
      preview: preview.slice(0, 500),
      contadores,
      totalFilas: registros.length,
      fuente: 'Sicofi Reporte Pagos',
    };
  }

  const mapping = sugerirMapping(columnas);
  const colUuidRel = buscarColumnaRelacionada(columnas);
  const registros = [];

  for (let i = 0; i < filas.length; i++) {
    const filaNum = i + 2;
    const resultado = filaARepPreview(filas[i], mapping, colUuidRel, filaNum);
    if (resultado.skip) {
      continue;
    }
    if (resultado.error) {
      registros.push({
        fila: filaNum,
        badge: 'ERROR',
        mensaje: resultado.mensaje,
      });
      continue;
    }
    registros.push(resultado.preview);
  }

  const erroresPrevios = registros.filter((r) => r.badge === 'ERROR');
  const validos = registros.filter((r) => r.badge !== 'ERROR');
  const { preview, contadores } = await enriquecerPreviewRep(validos, uuidsExistentes);
  contadores.ERROR += erroresPrevios.length;
  contadores.SKIP = filas.length - validos.length - erroresPrevios.length;
  preview.unshift(...erroresPrevios);

  return {
    columnas,
    mapping,
    encoding,
    colUuidRelacionado: colUuidRel,
    preview: preview.slice(0, 500),
    contadores,
    totalFilas: filas.length,
    fuente: 'Sicofi CFDI tipo P',
  };
}

export async function importarRepSicofi(body, clerkUserId) {
  const { csvBase64, nombreArchivo, filasSeleccionadas } = body ?? {};
  if (!csvBase64) throw new Error('Falta el archivo (csvBase64)');

  const buffer = Buffer.from(String(csvBase64), 'base64');
  const previewData = await construirPreviewRep(buffer, nombreArchivo || 'import.csv');
  const seleccion = Array.isArray(filasSeleccionadas)
    ? new Set(filasSeleccionadas.map(Number))
    : null;

  let importados = 0;
  let omitidos = 0;
  const alertas = [];

  for (const fila of previewData.preview) {
    if (fila.badge !== 'NUEVO') {
      omitidos += 1;
      continue;
    }
    if (seleccion && !seleccion.has(fila.fila)) {
      omitidos += 1;
      continue;
    }

    const facturasRelacionadas = [];
    let factura = null;
    if (fila.facturaId) {
      factura = await Factura.findById(fila.facturaId);
      if (factura) {
        if (factura.metodoPago !== 'PPD') {
          factura.metodoPago = 'PPD';
          await factura.save();
        }
        const saldo = Math.max(0, (factura.total || 0) - (factura.montoPagado || 0));
        const importe = Math.min(fila.monto, saldo || fila.monto);
        facturasRelacionadas.push({
          facturaId: factura._id,
          importePagado: importe,
        });
      }
    }

    if (!facturasRelacionadas.length) {
      alertas.push(
        `Fila ${fila.fila}: sin factura relacionada (${fila.uuidFacturaRel || fila.noFacturaRel || 'sin UUID/folio'})`
      );
      omitidos += 1;
      continue;
    }

    try {
      await crearComplemento(
        {
          uuid: fila.uuid,
          folio: fila.folio || `REP-${fila.uuid.slice(0, 8)}`,
          fechaEmision: fila.fechaEmision,
          fechaPago: fila.fechaPago,
          monto: fila.monto,
          cliente: fila.cliente,
          unidad: factura?.unidad || 'Consulting',
          facturasRelacionadas,
          origen: 'sicofi_import',
        },
        clerkUserId
      );
      importados += 1;
    } catch (err) {
      alertas.push(`Fila ${fila.fila}: ${err.message}`);
      omitidos += 1;
    }
  }

  return { importados, omitidos, alertas, contadores: previewData.contadores };
}
