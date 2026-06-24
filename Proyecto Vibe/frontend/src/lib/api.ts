import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { obtenerTokenClerk } from './clerk';

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

async function resolverTokenAuth(): Promise<string | null> {
  return obtenerTokenClerk();
}

export function guardarToken(_token: string) {
  // Clerk gestiona la sesión; no se usa localStorage.
}

export function eliminarToken() {
  // Clerk gestiona la sesión; no se usa localStorage.
}

export function guardarUsuario(_usuario: object) {
  // El perfil se obtiene desde la API con el token de Clerk.
}

export function obtenerUsuarioGuardado<T>(): T | null {
  return null;
}

export function eliminarUsuarioGuardado() {
  // El perfil se obtiene desde la API con el token de Clerk.
}

interface OpcionesFetch extends RequestInit {
  auth?: boolean;
  token?: string | null;
}

export async function api<T>(endpoint: string, opciones: OpcionesFetch = {}): Promise<T> {
  const { auth = true, token: tokenManual, headers, ...resto } = opciones;

  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = tokenManual ?? (await resolverTokenAuth());
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
      'No se pudo conectar con el servidor. Verifica que el backend esté en línea (Render) o corriendo en local.'
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
  const token = await resolverTokenAuth();
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
  const token = await resolverTokenAuth();
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
  const token = await resolverTokenAuth();
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
