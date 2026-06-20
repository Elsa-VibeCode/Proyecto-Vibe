<script lang="ts">
  import { page } from '$app/stores';
  import { auth } from '$lib/auth';
  import { etiquetaRol } from '$lib/utils';

  const enlaces = [
    { href: '/dashboard', label: 'Panel', icon: '📊' },
    { href: '/usuarios', label: 'Usuarios', icon: '👥' },
    { href: '/datos-excel', label: 'Datos Excel', icon: '📑' },
    { href: '/mapa', label: 'Mapa', icon: '🗺️' },
  ];

  let usuario = $derived($auth.usuario);
  let rutaActual = $derived($page.url.pathname);
</script>

<aside class="sidebar">
  <div class="brand">
    <span class="brand-icon">⚙️</span>
    <div>
      <h1>AdminSys</h1>
      <p>Sistema de administración</p>
    </div>
  </div>

  <nav>
    {#each enlaces as enlace}
      <a
        href={enlace.href}
        class:active={rutaActual.startsWith(enlace.href)}
      >
        <span>{enlace.icon}</span>
        {enlace.label}
      </a>
    {/each}
  </nav>

  {#if usuario}
    <div class="user-panel">
      <div class="user-info">
        <strong>{usuario.nombre}</strong>
        <span>{etiquetaRol(usuario.rol)}</span>
      </div>
      <button class="btn btn-secondary logout" onclick={() => auth.logout()}>
        Cerrar sesión
      </button>
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    width: 260px;
    min-height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1rem;
    position: fixed;
    left: 0;
    top: 0;
  }

  .brand {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 2rem;
    padding: 0 0.5rem;
  }

  .brand-icon {
    font-size: 1.75rem;
  }

  .brand h1 {
    font-size: 1.1rem;
    color: white;
    line-height: 1.2;
  }

  .brand p {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
  }

  nav a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    color: #cbd5e1;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
  }

  nav a:hover,
  nav a.active {
    background: rgba(79, 70, 229, 0.25);
    color: white;
  }

  .user-panel {
    border-top: 1px solid #1e293b;
    padding-top: 1rem;
    margin-top: 1rem;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-bottom: 0.75rem;
    padding: 0 0.5rem;
  }

  .user-info strong {
    color: white;
    font-size: 0.9rem;
  }

  .user-info span {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .logout {
    width: 100%;
    color: #e2e8f0;
    border-color: #334155;
    background: transparent;
  }

  .logout:hover {
    background: #1e293b;
  }
</style>
