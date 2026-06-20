export interface ImportacionExcel {
  _id?: string;
  id?: string;
  nombreArchivo: string;
  nombreHoja: string;
  columnas: string[];
  filas?: Record<string, unknown>[];
  totalFilas: number;
  createdAt?: string;
}
