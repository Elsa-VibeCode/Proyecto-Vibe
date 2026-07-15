<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { TipoGasto } from '$lib/types/egresos';

  let tipos = $state<TipoGasto[]>([]);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');
  let nuevoNombre = $state('');
  let guardando = $state(false);

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const data = await api<{ tipos: TipoGasto[] }>('/tipos-gasto');
      tipos = data.tipos;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar tipos de gasto';
    } finally {
      cargando = false;
    }
  }

  onMount(cargar);

  async function agregar(e: Event) {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    guardando = true;
    error = '';
    mensaje = '';
    try {
      await api('/tipos-gasto', { method: 'POST', body: JSON.stringify({ nombre: nuevoNombre.trim() }) });
      nuevoNombre = '';
      mensaje = 'Tipo de gasto agregado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al agregar';
    } finally {
      guardando = false;
    }
  }

  async function alternarActivo(tipo: TipoGasto) {
    error = '';
    try {
      await api(`/tipos-gasto/${tipo._id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !tipo.activo }),
      });
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al actualizar';
    }
  }

  async function eliminar(tipo: TipoGasto) {
    if (!confirm(`¿Eliminar el tipo de gasto "${tipo.nombre}"?`)) return;
    error = '';
    try {
      await api(`/tipos-gasto/${tipo._id}`, { method: 'DELETE' });
      mensaje = 'Tipo de gasto eliminado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar';
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Tipos de gasto</h1>
      <p>Catálogo editable usado en la captura de egresos</p>
    </div>
  </header>

  {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
  {#if error}<div class="alert alert-error">{error}</div>{/if}

  <form class="agregar card" onsubmit={agregar}>
    <input class="input" placeholder="Nuevo tipo de gasto..." bind:value={nuevoNombre} />
    <button class="btn btn-primary" type="submit" disabled={guardando}>
      {guardando ? 'Agregando...' : '+ Agregar'}
    </button>
  </form>

  <div class="card tabla-container">
    {#if cargando}
      <p class="estado">Cargando...</p>
    {:else if tipos.length === 0}
      <p class="estado">No hay tipos de gasto. Agrega el primero o corre <code>npm run seed:tipos-gasto</code>.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {#each tipos as tipo}
              <tr>
                <td>{tipo.nombre}</td>
                <td>
                  <span class="badge {tipo.activo ? 'badge-activo' : 'badge-inactivo'}">
                    {tipo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td class="acciones">
                  <button class="btn btn-secondary btn-sm" onclick={() => alternarActivo(tipo)}>
                    {tipo.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button class="btn btn-danger btn-sm" onclick={() => eliminar(tipo)}>Eliminar</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .page-header {
    margin-bottom: 1.25rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .alert {
    margin-bottom: 1rem;
  }

  .agregar {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .tabla-container {
    padding: 0;
    overflow: hidden;
  }

  .estado {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .acciones {
    display: flex;
    gap: 0.5rem;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }
</style>
