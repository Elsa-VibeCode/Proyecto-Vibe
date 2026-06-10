import type { Rol } from './types';

export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function etiquetaRol(rol: Rol): string {
  const etiquetas: Record<Rol, string> = {
    admin: 'Administrador',
    editor: 'Editor',
    visor: 'Visor',
  };
  return etiquetas[rol] || rol;
}
