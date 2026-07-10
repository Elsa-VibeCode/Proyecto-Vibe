const MESES_TEXTO = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

const ZONA = 'America/Mexico_City';

export function fechaActualMexico() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: ZONA }));
}

export function periodoActualMexico() {
  const hoy = fechaActualMexico();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}`;
}

export function esMesEnCurso(periodo) {
  return periodo === periodoActualMexico();
}

function normalizarTexto(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function excelSerialADate(serial) {
  const dias = Math.floor(Number(serial) - 25569);
  return new Date(dias * 86400 * 1000);
}

export function parsearFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;

  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    const d = excelSerialADate(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let anio = Number(dmy[3]);
    if (anio < 100) anio += 2000;
    const d = new Date(anio, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fechaAPeriodo(fecha) {
  if (!fecha) return null;
  const d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return null;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}`;
}

export function periodoDesdeTextoNomina(periodo, fechaFallback = null) {
  const match = String(periodo ?? '').match(/(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;

  const norm = normalizarTexto(periodo);
  for (const [nombre, num] of Object.entries(MESES_TEXTO)) {
    if (norm.includes(nombre)) {
      const anioMatch = norm.match(/20\d{2}/);
      const anio = anioMatch ? Number(anioMatch[0]) : fechaFallback?.getFullYear() ?? 2026;
      return `${anio}-${String(num).padStart(2, '0')}`;
    }
  }

  return fechaAPeriodo(fechaFallback);
}

export function etiquetaPeriodo(periodo) {
  const match = String(periodo).match(/(\d{4})-(\d{2})/);
  if (!match) return periodo;
  const meses = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const idx = Number(match[2]) - 1;
  return `${meses[idx] ?? match[2]} ${match[1]}`;
}

export function ordenarPeriodos(periodos) {
  return [...periodos].sort();
}

export function advertenciaDatosIncompletos(registrosPendientes, totalRegistrosMes) {
  if (totalRegistrosMes <= 0) return false;
  return registrosPendientes / totalRegistrosMes > 0.05;
}
