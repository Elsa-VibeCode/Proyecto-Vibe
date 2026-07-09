import 'dotenv/config';
import { connectDB } from './config/db.js';
import { normalizarClave } from '../utils/clasificacionMotor.js';
import { MapaUnidad } from './models/MapaUnidad.js';
import { MapaProveedor } from './models/MapaProveedor.js';

const MAPA_UNIDADES = [
  ['ACEROS INDUSTRIALES POTOSI', 'Technologies', 'confirmado'],
  ['ADMINISTRADORA CMIC', 'Consulting', 'confirmado'],
  ['ASOCIACION DE MAQUILADORAS Y EXPORTADORAS DE CHIHUAHUA', 'Consulting', 'por_confirmar'],
  ['ASOCIACION ESTATAL DE SOFOMES DE CHIHUAHUA', 'Technologies', 'confirmado'],
  ['BLUEWOLF ACHIEVEMENT', 'Consulting', 'por_confirmar'],
  ['CARITAS DE CHIHUAHUA', 'Consulting', 'confirmado'],
  ['CASINO DE CHIHUAHUA', 'Technologies', 'confirmado'],
  ['CHIHUAHUA ECONOMIC DEVELOPMENT CORPORATION', 'Consulting', 'confirmado'],
  ['CLES DE MEXICO', 'Consulting', 'confirmado'],
  ['COMBUSTIBLES TRICENTENARIO', 'Consulting', 'confirmado'],
  ['CONTROLADORA DE TERMINALES MEXICO', 'Technologies', 'confirmado'],
  ['CORMORAN DESARROLLOS', 'Consulting', 'confirmado'],
  ['CREO SOLUTIONS', 'Technologies', 'confirmado'],
  ['CROCSA CORPORATIVO', 'Technologies', 'confirmado'],
  ['DEMEK', 'Consulting', 'confirmado'],
  ['DURAPLAY', 'Consulting', 'confirmado'],
  ['EL CHINACATE', 'Consulting', 'confirmado'],
  [
    'FUNDACION SOCIAL DE LA ASOCIACION DE MAQUILADORAS Y EXPORTADORAS DE CHIHUAHUA',
    'Consulting',
    'confirmado',
  ],
  ['GILBERTO MERAZ VALVERDE', 'Technologies', 'confirmado'],
  ['GRUPO AMERICAN INDUSTRIES', 'Technologies', 'confirmado'],
  ['HI1LIGHT', 'Technologies', 'confirmado'],
  ['INDUSTRIAL GATE PUEBLA', 'Technologies', 'confirmado'],
  ['INDUSTRIAL GATE REYNOSA', 'Technologies', 'confirmado'],
  ['INDUSTRIAL GATE TIJUANA 1', 'Technologies', 'confirmado'],
  ['INDUSTRIAL GATE TIJUANA 2', 'Technologies', 'confirmado'],
  ['INNOVACION Y LIQUIDEZ EFECTIVA', 'Technologies', 'confirmado'],
  [
    'INSTITUTO DE ENTRENAMIENTO PARA NIÑOS CON LESION CEREBRAL Y TRANSTORNOS DEL APRENDIZAJE',
    'Grupo',
    'por_confirmar',
  ],
  ['INSTITUTO MEXICANO PARA LA GESTION INTEGRAL DE RIESGOS', 'Technologies', 'confirmado'],
  ['INTEGRACIONES TEMPLER', 'Consulting', 'confirmado'],
  ['INTERMEX MANUFACTURA DE CHIHUAHUA', 'Technologies', 'confirmado'],
  ['JUAN FRANCISCO PUENTE LARA', 'Consulting', 'confirmado'],
  ['LABORATORIO DE ESTUDIOS INTEGRALES DE CD JUAREZ', 'Technologies', 'confirmado'],
  ['LABORATORIO Y CONSULTORIA', 'Technologies', 'confirmado'],
  ['METROFITNESS', 'Consulting', 'confirmado'],
  ['Napco Inc DBA Papanicholas Coffee', 'Technologies', 'confirmado'],
  ['OPERADORA DE FRANQUICIAS GSF DE CHIHUAHUA', 'Consulting', 'confirmado'],
  ['RENDISOF', 'Technologies', 'confirmado'],
  ['SERVICIOS DE COMERCIO EXTERIOR Y LOGISTICA INTERNACIONAL HERMOREY', 'Consulting', 'confirmado'],
  ['SOLUCIONA TU FUTURO', 'Technologies', 'confirmado'],
  ['SOLUCIONES DENTALES RC', 'Consulting', 'confirmado'],
  ['THEEARTHLAB', 'Consulting', 'confirmado'],
  ['TRISTONE FLOWTECH MEXICO', 'Technologies', 'confirmado'],
  ['Tipp Distributor Inc. dba Novamex', 'Consulting', 'confirmado'],
  ['VALLES MARKETING Y ASOCIADOS', 'Consulting', 'confirmado'],
];

const MAPA_PROVEEDORES = [
  ['CAOS6801294P3', 'SALVADOR ENRIQUE CARREJO OROZCO', 'Consulting', 'confirmado'],
  ['GAVM780815620', 'MARIO ALEJANDRO GARCIA VARELA', 'Technologies', 'confirmado'],
  ['DOLE770121JP1', 'ELSA IVETTE DOMINGUEZ LEON', 'Consulting', 'confirmado'],
  ['FUJR870512AB8', 'ROBERTO FUENTES JUAREZ', 'Grupo', 'confirmado'],
  ['MESA731018NK9', 'ANA PAULA MENDEZ SALCEDO', 'Consulting', 'confirmado'],
  ['GPC200113DFA', 'GCG PLATAFORMA CONTABLE Y TRIBUTARIA', 'Grupo', 'confirmado'],
  ['RAD130627IH2', 'RED AMIGO DAL', 'Grupo', 'por_confirmar'],
  ['CVA041027H80', 'CONCESIONARIA VUELA COMPAÑIA DE AVIACION', 'Grupo', 'confirmado'],
  ['LBU200626KD4', 'LATAM BUSINESS UNIVERSITY', 'Grupo', 'confirmado'],
  ['ROQA920417DD7', 'ALMA CRISTINA RODRIGUEZ QUIROGA', 'Grupo', 'por_confirmar'],
  ['IEN031031215', 'INSTITUTO DE ENTRENAMIENTO PARA NIÑOS CON LESION', 'Grupo', 'por_confirmar'],
  ['RDI841003QJ4', 'RADIOMOVIL DIPSA', 'Grupo', 'confirmado'],
  ['EXP990810JX3', 'HUMAN CAPITAL INTERNATIONAL HCI', 'Grupo', 'por_confirmar'],
  ['CGR210810NA5', 'CAMAFEMIJO GROUP', 'Grupo', 'por_confirmar'],
  ['KAS950405QD4', 'KASIOPEA', 'Grupo', 'confirmado'],
  ['FAHR341130TJ4', 'ROSA ANDREA FAMILIAR HARO', 'Grupo', 'por_confirmar'],
  ['AME880912I89', 'AEROVIAS DE MEXICO', 'Grupo', 'confirmado'],
  ['WMA140411B13', 'WOLAK MONTEMAYOR ASOCIADOS', 'Grupo', 'por_confirmar'],
  ['TBN040609RKA', 'TELEDESIC BROADBAND NETWORKS', 'Grupo', 'por_confirmar'],
  ['MAMS920927480', 'SAMUEL OSWALDO MARTINEZ MENDEZ', 'Grupo', 'por_confirmar'],
  ['CNI411205LY2', 'CAMARA NACIONAL DE LA INDUSTRIA DE TRANSFORMACIO', 'Grupo', 'confirmado'],
];

async function seedColeccion(Modelo, datos, mapper) {
  let insertados = 0;
  let actualizados = 0;

  for (const fila of datos) {
    const documento = mapper(fila);
    const campoNorm =
      Modelo.modelName === 'MapaUnidad'
        ? 'clienteRazonSocialNormalizado'
        : 'razonSocialNormalizado';
    const valorNorm =
      Modelo.modelName === 'MapaUnidad'
        ? normalizarClave(documento.clienteRazonSocial)
        : normalizarClave(documento.razonSocial);

    const existente = await Modelo.findOne({ [campoNorm]: valorNorm });

    if (existente) {
      existente.set(documento);
      await existente.save();
      actualizados += 1;
    } else {
      await Modelo.create(documento);
      insertados += 1;
    }
  }

  return { insertados, actualizados };
}

async function main() {
  await connectDB();

  const unidades = await seedColeccion(MapaUnidad, MAPA_UNIDADES, ([cliente, unidad, estado]) => ({
    clienteRazonSocial: cliente,
    unidad,
    estado,
    notas: 'Seed Módulo A',
  }));

  const proveedores = await seedColeccion(
    MapaProveedor,
    MAPA_PROVEEDORES,
    ([rfcEmisor, razonSocial, unidad, estado]) => ({
      rfcEmisor,
      razonSocial,
      unidad,
      estado,
      notas: 'Seed Módulo A',
    })
  );

  console.log('✓ mapaUnidades:', unidades);
  console.log('✓ mapaProveedores:', proveedores);
  process.exit(0);
}

main().catch((error) => {
  console.error('Error en seed de mapas:', error);
  process.exit(1);
});
