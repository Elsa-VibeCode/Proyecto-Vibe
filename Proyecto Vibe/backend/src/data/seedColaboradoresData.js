/** @typedef {'Consulting'|'Technologies'|'Grupo'} Unidad */
/** @typedef {'socio'|'colaborador'|'honorarios_externos'} TipoRelacion */
/** @typedef {'honorarios_por_proyecto'|'sueldo_y_comisiones'|'honorarios_externos'} TipoNomina */

/**
 * [nombre, unidadBase, tipoRelacion, tipoNomina, notas]
 * @type {Array<[string, Unidad, TipoRelacion, TipoNomina, string]>}
 */
export const COLABORADORES_SEED = [
  [
    'Salvador Carrejo Orozco (Chava)',
    'Consulting',
    'socio',
    'honorarios_por_proyecto',
    'Honorarios por proyecto → Consulting completo; gastos de representación siempre Grupo',
  ],
  [
    'Elsa Ivette Domínguez León',
    'Consulting',
    'socio',
    'honorarios_por_proyecto',
    'Honorarios por proyecto → Consulting; administración $5,800/mes → Technologies (por concepto)',
  ],
  [
    'Mario Alejandro García Varela',
    'Technologies',
    'socio',
    'sueldo_y_comisiones',
    'Sueldo base + comisiones → Technologies completo',
  ],
  [
    'Roberto Fuentes Juárez',
    'Grupo',
    'honorarios_externos',
    'honorarios_externos',
    'Abogado del Grupo — honorarios externos, siempre Grupo',
  ],
  [
    'Ana Paula Méndez Salcedo',
    'Consulting',
    'colaborador',
    'honorarios_por_proyecto',
    'Nómina / gastos de viaje / comisiones',
  ],
  ['César Ulises Elías Ogaz', 'Consulting', 'colaborador', 'honorarios_por_proyecto', 'Nómina / comisiones'],
  ['Luis Fernando Pérez Nájera', 'Technologies', 'colaborador', 'sueldo_y_comisiones', 'Nómina'],
  ['Pamela Guizar Mendoza', 'Technologies', 'colaborador', 'sueldo_y_comisiones', 'Nómina'],
  ['Larissa Gabriela Bolívar Vázquez', 'Technologies', 'colaborador', 'sueldo_y_comisiones', 'Nómina'],
  ['Adrián Apolinar Pacheco Franco', 'Technologies', 'colaborador', 'sueldo_y_comisiones', 'Nómina'],
  ['Eduardo Curiel Pérez', 'Technologies', 'colaborador', 'sueldo_y_comisiones', 'Nómina / comisiones'],
  ['Roberto Bernádez', 'Consulting', 'socio', 'honorarios_por_proyecto', 'Socio agregado'],
  ['Antonio Fernández (Tony)', 'Consulting', 'socio', 'honorarios_por_proyecto', ''],
];

export const MONTO_ADMINISTRACION_ELSA = 5800;
