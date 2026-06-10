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

function crearAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    usuario: browser ? obtenerUsuarioGuardado<Usuario>() : null,
    cargando: false,
  });

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
