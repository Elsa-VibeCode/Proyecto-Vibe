export interface ImportacionExcel {
  _id?: string;
  id?: string;
  nombreArchivo: string;
  nombreHoja: string;
  columnas: string[];
  filas?: Record<string, unknown>[];
  totalFilas: number;
  filaEncabezado?: number;
  tipoHoja?: string;
  createdAt?: string;
}

export interface PrevisualizacionHoja {
  nombreHoja: string;
  filaEncabezado: number;
  columnas: string[];
  totalFilas: number;
  muestraFilas: Record<string, unknown>[];
  recomendada: boolean;
}

export interface PrevisualizacionLibro {
  hojas: PrevisualizacionHoja[];
  hojaSugerida: string;
}
