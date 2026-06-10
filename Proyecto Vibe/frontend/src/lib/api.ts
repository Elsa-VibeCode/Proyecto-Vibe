import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:3000/api';

function obtenerToken(): string | null {
  if (!browser) return null;
  return localStorage.getItem('token');
}

export function guardarToken(token: string) {
  if (browser) localStorage.setItem('token', token);
}

export function eliminarToken() {
  if (browser) localStorage.removeItem('token');
}

export function guardarUsuario(usuario: object) {
  if (browser) localStorage.setItem('usuario', JSON.stringify(usuario));
}

export function obtenerUsuarioGuardado<T>(): T | null {
  if (!browser) return null;
  const data = localStorage.getItem('usuario');
  return data ? JSON.parse(data) : null;
}

export function eliminarUsuarioGuardado() {
  if (browser) localStorage.removeItem('usuario');
}

interface OpcionesFetch extends RequestInit {
  auth?: boolean;
}

export async function api<T>(endpoint: string, opciones: OpcionesFetch = {}): Promise<T> {
  const { auth = true, headers, ...resto } = opciones;

  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = obtenerToken();
    if (token) cabeceras.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(`${API_URL}${endpoint}`, {
    ...resto,
    headers: cabeceras,
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(datos.mensaje || 'Error en la solicitud');
  }

  return datos as T;
}
