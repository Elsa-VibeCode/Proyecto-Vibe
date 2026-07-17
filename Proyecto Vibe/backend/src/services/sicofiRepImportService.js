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

export async function construirPreviewRep(buffer, nombreArchivo = '') {
  const { columnas, filas, encoding } = parsearArchivoSicofi(buffer, nombreArchivo);
  const mapping = sugerirMapping(columnas);
  const colUuidRel = buscarColumnaRelacionada(columnas);

  const preview = [];
  const contadores = { NUEVO: 0, DUPLICADO: 0, ERROR: 0, SKIP: 0, SIN_FACTURA: 0 };
  const uuidsExistentes = new Set(
    (await ComplementoPago.find({ uuid: { $ne: '' } }).select('uuid').lean()).map((c) => c.uuid)
  );

  for (let i = 0; i < filas.length; i++) {
    const filaNum = i + 2;
    const resultado = filaARepPreview(filas[i], mapping, colUuidRel, filaNum);
    if (resultado.skip) {
      contadores.SKIP += 1;
      continue;
    }
    if (resultado.error) {
      contadores.ERROR += 1;
      preview.push({ ...resultado, badge: 'ERROR' });
      continue;
    }

    const p = resultado.preview;
    if (uuidsExistentes.has(p.uuid)) {
      contadores.DUPLICADO += 1;
      preview.push({ ...p, badge: 'DUPLICADO' });
      continue;
    }

    let factura = null;
    if (p.uuidFacturaRel) {
      factura = await Factura.findOne({ ...FILTRO_ACTIVAS, uuid: p.uuidFacturaRel }).lean();
    }

    if (!factura) contadores.SIN_FACTURA += 1;
    else contadores.NUEVO += 1;

    preview.push({
      ...p,
      badge: factura ? 'NUEVO' : 'SIN_FACTURA',
      facturaId: factura?._id,
      noFacturaRel: factura?.noFactura,
    });
  }

  return {
    columnas,
    mapping,
    encoding,
    colUuidRelacionado: colUuidRel,
    preview: preview.slice(0, 500),
    contadores,
    totalFilas: filas.length,
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
    if (fila.badge !== 'NUEVO' && fila.badge !== 'SIN_FACTURA') {
      omitidos += 1;
      continue;
    }
    if (seleccion && !seleccion.has(fila.fila)) {
      omitidos += 1;
      continue;
    }

    const facturasRelacionadas = [];
    if (fila.facturaId) {
      const factura = await Factura.findById(fila.facturaId);
      if (factura) {
        const saldo = Math.max(0, (factura.total || 0) - (factura.montoPagado || 0));
        const importe = Math.min(fila.monto, saldo || fila.monto);
        facturasRelacionadas.push({
          facturaId: factura._id,
          importePagado: importe,
        });
      }
    }

    if (!facturasRelacionadas.length) {
      alertas.push(`Fila ${fila.fila}: sin factura relacionada (${fila.uuidFacturaRel || 'sin UUID'})`);
      omitidos += 1;
      continue;
    }

    await crearComplemento(
      {
        uuid: fila.uuid,
        folio: fila.folio || `REP-${fila.uuid.slice(0, 8)}`,
        fechaEmision: fila.fechaEmision,
        fechaPago: fila.fechaPago,
        monto: fila.monto,
        cliente: fila.cliente,
        unidad: (await Factura.findById(facturasRelacionadas[0].facturaId))?.unidad || 'Consulting',
        facturasRelacionadas,
        origen: 'sicofi_import',
      },
      clerkUserId
    );
    importados += 1;
  }

  return { importados, omitidos, alertas, contadores: previewData.contadores };
}
