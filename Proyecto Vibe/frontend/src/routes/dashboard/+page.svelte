<script lang="ts">
  import { onMount } from 'svelte';
  import { api, apiDescargar } from '$lib/api';
  import { formatearFecha, etiquetaRol } from '$lib/utils';
  import Modal from '$lib/components/Modal.svelte';
  import type { Estadisticas } from '$lib/types';

  let estadisticas = $state<Estadisticas | null>(null);
  let error = $state('');
  let cargando = $state(true);
  let exportando = $state(false);
  let modalEnvioAbierto = $state(false);
  let correoDestinatario = $state('');
  let enviandoReporte = $state(false);
  let mensajeExito = $state('');

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

  async function exportarExcel() {
    exportando = true;
    error = '';
    mensajeExito = '';

    try {
      await apiDescargar('/dashboard/exportar-excel', 'reporte-dashboard.xlsx');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al exportar Excel';
    } finally {
      exportando = false;
    }
  }

  function abrirModalEnvio() {
    correoDestinatario = '';
    error = '';
    mensajeExito = '';
    modalEnvioAbierto = true;
  }

  function cerrarModalEnvio() {
    modalEnvioAbierto = false;
    correoDestinatario = '';
  }

  async function enviarReporte(event: SubmitEvent) {
    event.preventDefault();
    enviandoReporte = true;
    error = '';
    mensajeExito = '';

    try {
      const data = await api<{ mensaje: string }>('/dashboard/enviar-reporte', {
        method: 'POST',
        body: JSON.stringify({ destinatario: correoDestinatario.trim() }),
      });
      mensajeExito = data.mensaje;
      cerrarModalEnvio();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al enviar el reporte';
    } finally {
      enviandoReporte = false;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Panel de control</h1>
      <p>Resumen general del sistema — zona horaria México (CDMX)</p>
    </div>
    <div class="header-actions">
      {#if estadisticas}
        <span class="fecha">{estadisticas.fechaConsulta}</span>
      {/if}
      <button class="btn btn-secondary" onclick={exportarExcel} disabled={exportando || cargando}>
        {exportando ? 'Exportando...' : 'Exportar a Excel'}
      </button>
      <button class="btn btn-primary" onclick={abrirModalEnvio} disabled={cargando || enviandoReporte}>
        {enviandoReporte ? 'Enviando...' : 'Exportar reporte y enviar'}
      </button>
    </div>
  </header>

  {#if mensajeExito}
    <div class="alert alert-success">{mensajeExito}</div>
  {/if}

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

<Modal abierto={modalEnvioAbierto} titulo="Exportar reporte y enviar" onCerrar={cerrarModalEnvio}>
  <form onsubmit={enviarReporte}>
    <p class="modal-descripcion">
      Se generará el Excel del panel de control y se enviará al correo indicado.
    </p>

    <div class="form-group">
      <label class="label" for="correo-destinatario">Correo del destinatario</label>
      <input
        id="correo-destinatario"
        class="input"
        type="email"
        bind:value={correoDestinatario}
        placeholder="ejemplo@correo.com"
        required
      />
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={cerrarModalEnvio}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={enviandoReporte}>
        {enviandoReporte ? 'Enviando...' : 'Generar y enviar'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
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

  .modal-descripcion {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    margin-bottom: 1.25rem;
    line-height: 1.5;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .alert-success {
    margin-bottom: 1rem;
    padding: 0.875rem 1rem;
    border-radius: var(--radius);
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
  }
</style>
