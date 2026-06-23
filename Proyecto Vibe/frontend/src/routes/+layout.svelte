<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { children } = $props();

  $effect(() => {
    const esPublica = page.url.pathname === '/';

    if (!esPublica && !$auth.usuario) {
      goto('/');
    } else if (esPublica && $auth.usuario) {
      goto('/dashboard');
    }
  });
</script>

{#if page.url.pathname === '/'}
  {@render children()}
{:else if $auth.usuario}
  <div class="layout">
    <Sidebar />
    <main>{@render children()}</main>
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
  }
</style>
