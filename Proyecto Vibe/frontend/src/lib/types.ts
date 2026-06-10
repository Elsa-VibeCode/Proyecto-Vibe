export type Rol = 'admin' | 'editor' | 'visor';

export interface Usuario {
  _id?: string;
  id?: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo?: boolean;
  ultimoAcceso?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Paginacion {
  total: number;
  pagina: number;
  limite: number;
  paginas: number;
}

export interface Estadisticas {
  totalUsuarios: number;
  usuariosActivos: number;
  usuariosInactivos: number;
  roles: Record<Rol, number>;
  usuariosRecientes: Usuario[];
  zonaHoraria: string;
  fechaConsulta: string;
}
