import { MapaUnidad } from '../models/MapaUnidad.js';
import { MapaProveedor } from '../models/MapaProveedor.js';
import { normalizarClave, normalizarUnidad } from '../utils/clasificacionMotor.js';
import { MAPA_PROVEEDORES_SEED, MAPA_UNIDADES_SEED } from '../data/seedMapasData.js';

function parsearEstadoMapa(valor) {
  const norm = normalizarClave(valor);
  if (!norm) return 'confirmado';
  if (norm.includes('por confirmar') || norm.includes('por_confirmar')) {
    return 'por_confirmar';
  }
  return 'confirmado';
}

export async function sincronizarMapaUnidadesDesdeFilas(filas, mapeo, usuarioId = null) {
  if (!mapeo.cliente || !mapeo.unidad) {
    return { sincronizados: 0, omitidos: filas.length };
  }

  let sincronizados = 0;

  for (const fila of filas) {
    const cliente = String(fila[mapeo.cliente] ?? '').trim();
    const unidadRaw = String(fila[mapeo.unidad] ?? '').trim();
    if (!cliente || !unidadRaw) continue;

    const unidad = normalizarUnidad(unidadRaw);
    if (!['Consulting', 'Technologies', 'Grupo'].includes(unidad)) continue;

    const estado = mapeo.estado
      ? parsearEstadoMapa(fila[mapeo.estado])
      : 'confirmado';

    await MapaUnidad.findOneAndUpdate(
      { clienteRazonSocialNormalizado: normalizarClave(cliente) },
      {
        clienteRazonSocial: cliente,
        unidad,
        estado,
        notas: 'Sincronizado desde Excel',
        actualizadoPor: usuarioId,
      },
      { upsert: true, new: true, runValidators: true }
    );
    sincronizados += 1;
  }

  return { sincronizados };
}

export async function sembrarMapasSiVacios(usuarioId = null) {
  const totalUnidades = await MapaUnidad.countDocuments();
  const totalProveedores = await MapaProveedor.countDocuments();

  let unidadesSembradas = 0;
  let proveedoresSembrados = 0;

  if (totalUnidades === 0) {
    for (const [cliente, unidad, estado] of MAPA_UNIDADES_SEED) {
      await MapaUnidad.create({
        clienteRazonSocial: cliente,
        unidad,
        estado,
        notas: 'Mapa inicial BLWOLF',
        actualizadoPor: usuarioId,
      });
      unidadesSembradas += 1;
    }
  }

  if (totalProveedores === 0) {
    for (const [rfcEmisor, razonSocial, unidad, estado] of MAPA_PROVEEDORES_SEED) {
      await MapaProveedor.create({
        rfcEmisor,
        razonSocial,
        unidad,
        estado,
        notas: 'Mapa inicial BLWOLF',
        actualizadoPor: usuarioId,
      });
      proveedoresSembrados += 1;
    }
  }

  return {
    unidadesSembradas,
    proveedoresSembrados,
    yaExistian: totalUnidades > 0 || totalProveedores > 0,
  };
}

export async function asegurarMapaUnidadesDisponible(usuarioId = null) {
  const total = await MapaUnidad.countDocuments();
  if (total > 0) return { origen: 'existente', total };

  const sembrado = await sembrarMapasSiVacios(usuarioId);
  if (sembrado.unidadesSembradas > 0) {
    return { origen: 'seed', total: sembrado.unidadesSembradas };
  }

  return { origen: 'vacio', total: 0 };
}
