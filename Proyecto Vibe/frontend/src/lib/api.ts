import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const BACKEND_PRODUCCION = 'https://proyecto-vibe-1.onrender.com/api';

function normalizarApiUrl(url: string): string {
  const limpia = url.trim().replace(/\/+$/, '');
  if (limpia.endsWith('/api')) return limpia;
  return `${limpia}/api`;
}

function obtenerApiUrl(): string {
  if (env.PUBLIC_API_URL?.trim()) {
    return normalizarApiUrl(env.PUBLIC_API_URL);
  }

  if (browser) {
    if (window.location.hostname.endsWith('.onrender.com')) {
      return BACKEND_PRODUCCION;
    }
    return '/api';
  }

  return 'http://localhost:3000/api';
}

function construirUrl(endpoint: string): string {
  const base = obtenerApiUrl();
  const ruta = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${ruta}`;
}

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

  let respuesta: Response;

  try {
    respuesta = await fetch(construirUrl(endpoint), {
      ...resto,
      headers: cabeceras,
    });
  } catch {
    throw new Error(
      'No se pudo conectar con el servidor. Verifica que el backend esté corriendo en el puerto 3000.'
    );
  }

  const contentType = respuesta.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'No se pudo conectar con la API. Verifica PUBLIC_API_URL en Render y vuelve a desplegar el frontend.'
    );
  }

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const mensaje = (datos as { mensaje?: string })?.mensaje;
    if (respuesta.status === 404 && mensaje === 'Ruta no encontrada') {
      throw new Error(
        'La API no respondió en la ruta esperada. En Render, PUBLIC_API_URL debe terminar en /api (ejemplo: https://proyecto-vibe-1.onrender.com/api).'
      );
    }
    throw new Error(mensaje || 'Error en la solicitud');
  }

  if (datos === null) {
    throw new Error('Respuesta inválida del servidor.');
  }

  return datos as T;
}

export async function apiSubirArchivo<T>(
  endpoint: string,
  archivo: File,
  campo = 'archivo'
): Promise<T> {
  const formData = new FormData();
  formData.append(campo, archivo);

  const cabeceras: Record<string, string> = {};
  const token = obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta: Response;

  try {
    respuesta = await fetch(construirUrl(endpoint), {
      method: 'POST',
      headers: cabeceras,
      body: formData,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor para subir el archivo.');
  }

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(datos.mensaje || 'Error al subir el archivo');
  }

  return datos as T;
}

export async function apiDescargar(endpoint: string, nombreArchivo: string): Promise<void> {
  const cabeceras: Record<string, string> = {};
  const token = obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta: Response;

  try {
    respuesta = await fetch(construirUrl(endpoint), { headers: cabeceras });
  } catch {
    throw new Error('No se pudo conectar con el servidor para descargar el archivo.');
  }

  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    throw new Error(datos.mensaje || 'Error al descargar el archivo');
  }

  await descargarBlob(await respuesta.blob(), nombreArchivo);
}

export async function apiDescargarPost(
  endpoint: string,
  nombreArchivo: string,
  body: object
): Promise<void> {
  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta: Response;

  try {
    respuesta = await fetch(construirUrl(endpoint), {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor para descargar el archivo.');
  }

  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    throw new Error(datos.mensaje || 'Error al descargar el archivo');
  }

  await descargarBlob(await respuesta.blob(), nombreArchivo);
}

function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
