<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/auth';
  import { etiquetaRol } from '$lib/utils';
  import { UserButton, SignOutButton } from 'svelte-clerk/client';

  const enlaces = [
    { href: '/panel', label: 'Panel', icon: '📊' },
    { href: '/facturacion', label: 'Facturación', icon: '🧾' },
    { href: '/egresos', label: 'Egresos', icon: '💸' },
    { href: '/clasificacion', label: 'Clasificación', icon: '🏷️' },
    { href: '/finanzas', label: 'Finanzas', icon: '💰' },
    { href: '/nomina', label: 'Nómina', icon: '👥' },
    { href: '/aportaciones', label: 'Aportaciones', icon: '🏛️' },
    { href: '/estado-cuenta', label: 'Estado de cuenta', icon: '🏦' },
    { href: '/conciliacion', label: 'Conciliación', icon: '🔍' },
    { href: '/usuarios', label: 'Usuarios', icon: '👥' },
    { href: '/datos-excel', label: 'Datos Excel', icon: '📑' },
    { href: '/mapa', label: 'Mapa', icon: '🗺️' },
    { href: '/config/tipos-gasto', label: 'Tipos de gasto', icon: '⚙️' },
  ];

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
        class:active={page.url.pathname.startsWith(enlace.href)}
      >
        <span>{enlace.icon}</span>
        {enlace.label}
      </a>
    {/each}
  </nav>

  {#if $auth.usuario}
    <div class="user-panel">
      <div class="user-info">
        <strong>{$auth.usuario.nombre}</strong>
        <span>{etiquetaRol($auth.usuario.rol)}</span>
      </div>
      <div class="user-actions">
        <UserButton />
        <SignOutButton redirectUrl="/sign-in">
          {#snippet children({ signOut })}
            <button
              type="button"
              class="btn-logout"
              onclick={() => {
                auth.limpiar();
                signOut();
              }}
            >
              Cerrar sesión
            </button>
          {/snippet}
        </SignOutButton>
      </div>
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    width: 260px;
    height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1rem;
    position: fixed;
    left: 0;
    top: 0;
    overflow: hidden;
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
    min-height: 0;
    overflow-y: auto;
    margin-right: -0.25rem;
    padding-right: 0.25rem;
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
    margin-top: 0.75rem;
    flex-shrink: 0;
  }

  .user-actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 0.25rem;
  }

  .btn-logout {
    flex: 1;
    padding: 0.45rem 0.65rem;
    border-radius: 8px;
    border: 1px solid #334155;
    background: transparent;
    color: #e2e8f0;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    text-align: center;
  }

  .btn-logout:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #f87171;
    color: #fecaca;
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
</style>
