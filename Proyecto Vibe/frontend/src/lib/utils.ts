import type { Rol } from './types';

export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatearMoneda(valor: number | null | undefined): string {
  const n = Number(valor) || 0;
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
