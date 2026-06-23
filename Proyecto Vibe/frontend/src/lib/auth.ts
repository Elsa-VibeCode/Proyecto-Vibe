import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
  api,
  guardarToken,
  eliminarToken,
  guardarUsuario,
  obtenerUsuarioGuardado,
  eliminarUsuarioGuardado,
} from './api';
import type { Usuario } from './types';

interface AuthState {
  usuario: Usuario | null;
  cargando: boolean;
}

function obtenerEstadoInicial(): AuthState {
  if (!browser) return { usuario: null, cargando: false };

  const usuario = obtenerUsuarioGuardado<Usuario>();
  const token = localStorage.getItem('token');

  if (usuario && !token) {
    eliminarUsuarioGuardado();
    return { usuario: null, cargando: false };
  }

  return { usuario, cargando: false };
}

function crearAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(obtenerEstadoInicial());

  return {
    subscribe,
    async login(email: string, password: string) {
      update((s) => ({ ...s, cargando: true }));

      try {
        const data = await api<{ token: string; usuario: Usuario }>('/auth/login', {
          method: 'POST',
          auth: false,
          body: JSON.stringify({ email, password }),
        });

        if (!data?.token || !data?.usuario) {
          throw new Error('Credenciales incorrectas o respuesta inválida del servidor.');
        }

        guardarToken(data.token);
        guardarUsuario(data.usuario);
        set({ usuario: data.usuario, cargando: false });
        return data.usuario;
      } catch (error) {
        update((s) => ({ ...s, cargando: false }));
        throw error;
      }
    },
    async registro(email: string, password: string) {
      update((s) => ({ ...s, cargando: true }));

      try {
        const data = await api<{ token: string; usuario: Usuario }>('/auth/registro', {
          method: 'POST',
          auth: false,
          body: JSON.stringify({ email, password }),
        });

        if (!data?.token || !data?.usuario) {
          throw new Error('No se pudo completar el registro. Intenta de nuevo.');
        }

        guardarToken(data.token);
        guardarUsuario(data.usuario);
        set({ usuario: data.usuario, cargando: false });
        return data.usuario;
      } catch (error) {
        update((s) => ({ ...s, cargando: false }));
        throw error;
      }
    },
    logout() {
      eliminarToken();
      eliminarUsuarioGuardado();
      set({ usuario: null, cargando: false });
    },
    setUsuario(usuario: Usuario | null) {
      if (usuario) guardarUsuario(usuario);
      update((s) => ({ ...s, usuario }));
    },
  };
}

export const auth = crearAuthStore();
