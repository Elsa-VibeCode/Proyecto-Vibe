<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { useClerkContext } from 'svelte-clerk';
  import { auth } from '$lib/auth';
  import { esRutaPublica } from '$lib/clerk';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { children } = $props();

  const clerk = useClerkContext();
  let errorSync = $state('');

  async function sincronizarSesion() {
    if (!clerk.session) {
      errorSync = 'No se obtuvo la sesión de Clerk. Intenta cerrar sesión y volver a entrar.';
      return;
    }

    const token = await clerk.session.getToken();
    if (!token) {
      errorSync = 'No se pudo obtener el token de Clerk. Recarga la página e intenta de nuevo.';
      return;
    }

    const resultado = await auth.sincronizarPerfil(token);
    if (!resultado.ok) {
      errorSync =
        resultado.error ??
        'No se pudo conectar con el backend. Verifica que esté corriendo en el puerto 3000.';
    } else {
      errorSync = '';
    }
  }

  $effect(() => {
    if (!clerk.isLoaded) return;

    const signedIn = Boolean(clerk.auth.userId);
    const publica = esRutaPublica(page.url.pathname);

    if (signedIn) {
      void sincronizarSesion();
    } else {
      auth.limpiar();
      errorSync = '';
    }

    if (!publica && !signedIn) {
      goto('/sign-in');
    } else if (publica && signedIn && page.url.pathname === '/') {
      goto('/dashboard');
    }
  });
</script>

{#if esRutaPublica(page.url.pathname)}
  {@render children()}
{:else if clerk.isLoaded && clerk.auth.userId && $auth.usuario}
  <div class="layout">
    <Sidebar />
    <main>{@render children()}</main>
  </div>
{:else if errorSync}
  <div class="cargando">
    <div class="error-card card">
      <p>{errorSync}</p>
      <button class="btn btn-secondary" type="button" onclick={() => goto('/sign-in')}>
        Volver al inicio de sesión
      </button>
    </div>
  </div>
{:else}
  <div class="cargando">Cargando...</div>
{/if}

<style>
  .layout {
    display: flex;
    min-height: 100vh;
  }

  main {
    flex: 1;
    margin-left: 260px;
    padding: 2rem;
    min-height: 100vh;
  }

  .cargando {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    color: var(--color-text-muted);
    padding: 1.5rem;
  }

  .error-card {
    max-width: 420px;
    padding: 1.5rem;
    text-align: center;
  }

  .error-card p {
    margin-bottom: 1rem;
    color: var(--color-danger);
  }
</style>
