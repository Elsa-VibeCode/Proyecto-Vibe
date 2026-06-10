<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearFecha, etiquetaRol } from '$lib/utils';
  import type { Estadisticas } from '$lib/types';

  let estadisticas = $state<Estadisticas | null>(null);
  let error = $state('');
  let cargando = $state(true);

  onMount(async () => {
    try {
      const data = await api<{ estadisticas: Estadisticas }>('/dashboard/estadisticas');
      estadisticas = data.estadisticas;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar estadísticas';
    } finally {
      cargando = false;
    }
  });
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Panel de control</h1>
      <p>Resumen general del sistema — zona horaria México (CDMX)</p>
    </div>
    {#if estadisticas}
      <span class="fecha">{estadisticas.fechaConsulta}</span>
    {/if}
  </header>

  {#if cargando}
    <p class="estado">Cargando estadísticas...</p>
  {:else if error}
    <div class="alert alert-error">{error}</div>
  {:else if estadisticas}
    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">Total usuarios</span>
        <span class="stat-value">{estadisticas.totalUsuarios}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Activos</span>
        <span class="stat-value activo">{estadisticas.usuariosActivos}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Inactivos</span>
        <span class="stat-value inactivo">{estadisticas.usuariosInactivos}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Administradores</span>
        <span class="stat-value">{estadisticas.roles.admin}</span>
      </div>
    </div>

    <div class="roles-grid">
      <div class="role-card card">
        <h3>Editores</h3>
        <span>{estadisticas.roles.editor}</span>
      </div>
      <div class="role-card card">
        <h3>Visores</h3>
        <span>{estadisticas.roles.visor}</span>
      </div>
    </div>

    <section class="card recientes">
      <h2>Usuarios recientes</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Registro</th>
            </tr>
          </thead>
          <tbody>
            {#each estadisticas.usuariosRecientes as usuario}
              <tr>
                <td>{usuario.nombre}</td>
                <td>{usuario.email}</td>
                <td><span class="badge badge-{usuario.rol}">{etiquetaRol(usuario.rol)}</span></td>
                <td>
                  <span class="badge {usuario.activo ? 'badge-activo' : 'badge-inactivo'}">
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>{formatearFecha(usuario.createdAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .fecha {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 0.5rem 0.875rem;
    border-radius: var(--radius);
    white-space: nowrap;
  }

  .estado {
    color: var(--color-text-muted);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 800;
    color: var(--color-primary);
  }

  .stat-value.activo {
    color: var(--color-success);
  }

  .stat-value.inactivo {
    color: var(--color-danger);
  }

  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .role-card {
    padding: 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .role-card h3 {
    font-size: 0.95rem;
    color: var(--color-text-muted);
  }

  .role-card span {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .recientes {
    padding: 1.5rem;
  }

  .recientes h2 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }
</style>
