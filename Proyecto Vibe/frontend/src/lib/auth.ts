import { writable } from 'svelte/store';
import { api } from './api';
import type { Usuario } from './types';

interface AuthState {
  usuario: Usuario | null;
  cargando: boolean;
}

function crearAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    usuario: null,
    cargando: false,
  });

  let sincronizando = false;

  return {
    subscribe,
    async sincronizarPerfil(token?: string | null): Promise<{ ok: boolean; error?: string }> {
      if (sincronizando) return { ok: false };
      sincronizando = true;
      update((s) => ({ ...s, cargando: true }));

      try {
        const data = await api<{ usuario: Usuario }>('/auth/perfil', { token });
        set({ usuario: data.usuario, cargando: false });
        return { ok: true };
      } catch (err) {
        set({ usuario: null, cargando: false });
        const mensaje = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, error: mensaje };
      } finally {
        sincronizando = false;
      }
    },
    limpiar() {
      set({ usuario: null, cargando: false });
    },
  };
}

export const auth = crearAuthStore();
