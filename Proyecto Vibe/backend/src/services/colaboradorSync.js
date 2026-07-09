import { Colaborador } from '../models/Colaborador.js';
import { NominaPago } from '../models/NominaPago.js';
import { normalizarClave } from '../utils/clasificacionMotor.js';
import { inferirTipoNomina } from '../utils/nominaMotor.js';
import { COLABORADORES_SEED } from '../data/seedColaboradoresData.js';

export async function upsertColaborador(datos, usuarioId = null) {
  const nombre = String(datos.nombre ?? '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio');

  const tipoNomina =
    datos.tipoNomina ?? inferirTipoNomina(datos.unidadBase, datos.tipoRelacion);

  const doc = await Colaborador.findOneAndUpdate(
    { nombreNormalizado: normalizarClave(nombre) },
    {
      nombre,
      unidadBase: datos.unidadBase,
      tipoRelacion: datos.tipoRelacion,
      tipoNomina,
      notas: datos.notas ?? '',
      actualizadoPor: usuarioId,
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  if (doc.reglasSueldo) {
    doc.reglasSueldo = undefined;
    await doc.save();
  }

  return doc;
}

export async function sembrarColaboradores(usuarioId = null) {
  await Colaborador.updateMany({ tipoRelacion: 'empleado' }, { $set: { tipoRelacion: 'colaborador' } });
  await Colaborador.updateMany({}, { $unset: { reglasSueldo: '' } });
  await NominaPago.updateMany(
    { estadoClasificacion: 'excede_tope_revisar' },
    { $set: { estadoClasificacion: 'auto_confirmado' }, $unset: { montoExcedente: '' } }
  );

  let sembrados = 0;
  let actualizados = 0;

  for (const [nombre, unidadBase, tipoRelacion, tipoNomina, notas] of COLABORADORES_SEED) {
    const key = normalizarClave(nombre);
    const existia = await Colaborador.exists({ nombreNormalizado: key });
    await upsertColaborador(
      { nombre, unidadBase, tipoRelacion, tipoNomina, notas },
      usuarioId
    );
    if (existia) actualizados += 1;
    else sembrados += 1;
  }

  return { sembrados, actualizados, total: COLABORADORES_SEED.length };
}

export async function asegurarColaboradoresDisponibles(usuarioId = null) {
  const resultado = await sembrarColaboradores(usuarioId);
  const total = await Colaborador.countDocuments();
  return {
    origen: 'catalogo',
    total,
    ...resultado,
  };
}

export async function obtenerIndiceColaboradores() {
  await asegurarColaboradoresDisponibles();
  const lista = await Colaborador.find().lean();
  const porClave = new Map();
  const porToken = new Map();

  for (const col of lista) {
    porClave.set(col.nombreNormalizado, col);
    const tokens = extraerTokensNombre(col.nombre);
    for (const token of tokens) {
      if (!porToken.has(token)) porToken.set(token, col);
    }
  }

  return { lista, porClave, porToken };
}

function extraerTokensNombre(nombre) {
  const tokens = new Set();
  const parentesis = nombre.match(/\(([^)]+)\)/);
  if (parentesis) {
    normalizarClave(parentesis[1])
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
      .forEach((t) => tokens.add(t));
  }
  normalizarClave(nombre.replace(/\([^)]*\)/g, ' '))
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .forEach((t) => tokens.add(t));
  return [...tokens];
}
