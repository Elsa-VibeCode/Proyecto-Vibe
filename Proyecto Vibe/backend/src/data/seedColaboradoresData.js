/** @typedef {'Consulting'|'Technologies'|'Grupo'} Unidad */
/** @typedef {'socio'|'empleado'|'honorarios_externos'} TipoRelacion */

/**
 * @type {Array<[string, Unidad, TipoRelacion, string, Array<object>|null]>}
 */
export const COLABORADORES_SEED = [
  [
    'Salvador Carrejo Orozco (Chava)',
    'Consulting',
    'socio',
    '$58,000/mes ene–abr 2026; desde mayo por_proyecto; gastos de representación siempre Grupo',
    [
      {
        vigenciaDesde: new Date('2026-01-01'),
        vigenciaHasta: new Date('2026-04-30'),
        tipo: 'sueldo_fijo',
        montoTope: 58000,
        notas: 'Sueldo base enero–abril 2026',
      },
      {
        vigenciaDesde: new Date('2026-05-01'),
        vigenciaHasta: null,
        tipo: 'por_proyecto',
        montoTope: null,
        notas: 'Sin tope fijo desde mayo 2026',
      },
    ],
  ],
  [
    'Elsa Ivette Domínguez León',
    'Consulting',
    'socio',
    '$58,000/mes ene–abr 2026; desde mayo por_proyecto; +$5,800/mes administración fijo a Technologies',
    [
      {
        vigenciaDesde: new Date('2026-01-01'),
        vigenciaHasta: new Date('2026-04-30'),
        tipo: 'sueldo_fijo',
        montoTope: 58000,
        notas: 'Sueldo base enero–abril 2026',
      },
      {
        vigenciaDesde: new Date('2026-05-01'),
        vigenciaHasta: null,
        tipo: 'por_proyecto',
        montoTope: null,
        notas: 'Sin tope fijo desde mayo 2026',
      },
    ],
  ],
  [
    'Mario Alejandro García Varela',
    'Technologies',
    'socio',
    '$90,000/mes todos los meses sin cambio; excedente si lo hubiera → revisión',
    [
      {
        vigenciaDesde: new Date('2026-01-01'),
        vigenciaHasta: null,
        tipo: 'sueldo_fijo',
        montoTope: 90000,
        notas: 'Sin cambio de régimen en mayo',
      },
    ],
  ],
  [
    'Roberto Fuentes Juárez',
    'Grupo',
    'honorarios_externos',
    'Abogado del Grupo — honorarios externos, siempre Grupo (no es colaborador interno)',
    [],
  ],
  ['Ana Paula Méndez Salcedo', 'Consulting', 'empleado', 'Nómina / gastos de viaje / comisiones', []],
  ['César Ulises Elías Ogaz', 'Consulting', 'empleado', 'Nómina / comisiones', []],
  ['Luis Fernando Pérez Nájera', 'Technologies', 'empleado', 'Nómina', []],
  ['Pamela Guizar Mendoza', 'Technologies', 'empleado', 'Nómina', []],
  ['Larissa Gabriela Bolívar Vázquez', 'Technologies', 'empleado', 'Nómina', []],
  ['Adrián Apolinar Pacheco Franco', 'Technologies', 'empleado', 'Nómina', []],
  ['Eduardo Curiel Pérez', 'Technologies', 'empleado', 'Nómina / comisiones', []],
  ['Roberto Bernádez', 'Consulting', 'socio', 'Socio agregado', []],
  ['Antonio Fernández (Tony)', 'Consulting', 'socio', '', []],
];

/** Monto fijo administración Elsa → Technologies (concepto separado del sueldo base). */
export const MONTO_ADMINISTRACION_ELSA = 5800;
