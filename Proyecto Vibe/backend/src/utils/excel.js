import * as XLSX from 'xlsx';

export function parsearExcel(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer' });
  const nombreHoja = libro.SheetNames[0];

  if (!nombreHoja) {
    throw new Error('El archivo Excel no contiene hojas');
  }

  const hoja = libro.Sheets[nombreHoja];
  const datos = XLSX.utils.sheet_to_json(hoja, { defval: '' });

  if (datos.length === 0) {
    throw new Error('El archivo Excel está vacío');
  }

  const columnas = Object.keys(datos[0]);

  return {
    nombreHoja,
    columnas,
    filas: datos,
    totalFilas: datos.length,
  };
}

export function generarExcel({ nombreHoja = 'Datos', columnas, filas }) {
  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}
