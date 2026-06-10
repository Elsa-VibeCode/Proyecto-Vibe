<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { children } = $props();

  let esLogin = $derived($page.url.pathname === '/login');
  let usuario = $derived($auth.usuario);

  $effect(() => {
    if (!esLogin && !usuario) {
      goto('/login');
    }
    if (esLogin && usuario) {
      goto('/dashboard');
    }
  });
</script>

{#if esLogin}
  {@render children()}
{:else if usuario}
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
