<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import Modal from '$lib/components/Modal.svelte';
  import type { MapaProveedor, MapaUnidad } from '$lib/types/admin';

  type Tab = 'unidades' | 'proveedores';
  type Unidad = MapaUnidad['unidad'];
  type Estado = MapaUnidad['estado'];

  let tab = $state<Tab>('unidades');
  let unidades = $state<MapaUnidad[]>([]);
  let proveedores = $state<MapaProveedor[]>([]);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');

  let modalAbierto = $state(false);
  let modoEdicion = $state(false);
  let editandoId = $state('');
  let guardando = $state(false);

  let formCliente = $state('');
  let formRazonSocial = $state('');
  let formRfc = $state('');
  let formUnidad = $state<Unidad>('Consulting');
  let formEstado = $state<Estado>('por_confirmar');
  let formNotas = $state('');

  let puedeEditar = $derived($auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor');

  async function cargarDatos() {
    cargando = true;
    error = '';
    try {
      const [dataUnidades, dataProveedores] = await Promise.all([
        api<{ unidades: MapaUnidad[] }>('/mapas/unidades'),
        api<{ proveedores: MapaProveedor[] }>('/mapas/proveedores'),
      ]);
      unidades = dataUnidades.unidades;
      proveedores = dataProveedores.proveedores;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar mapas';
    } finally {
      cargando = false;
    }
  }

  onMount(() => cargarDatos());

  function abrirCrear() {
    modoEdicion = false;
    editandoId = '';
    formCliente = '';
    formRazonSocial = '';
    formRfc = '';
    formUnidad = 'Consulting';
    formEstado = 'por_confirmar';
    formNotas = '';
    modalAbierto = true;
  }

  function abrirEditarUnidad(item: MapaUnidad) {
    modoEdicion = true;
    editandoId = item._id;
    formCliente = item.clienteRazonSocial;
    formUnidad = item.unidad;
    formEstado = item.estado;
    formNotas = item.notas ?? '';
    modalAbierto = true;
  }

  function abrirEditarProveedor(item: MapaProveedor) {
    modoEdicion = true;
    editandoId = item._id;
    formRazonSocial = item.razonSocial;
    formRfc = item.rfcEmisor ?? '';
    formUnidad = item.unidad;
    formEstado = item.estado;
    formNotas = item.notas ?? '';
    modalAbierto = true;
  }

  async function guardar() {
    guardando = true;
    mensaje = '';
    error = '';
    try {
      if (tab === 'unidades') {
        const body = {
          clienteRazonSocial: formCliente,
          unidad: formUnidad,
          estado: formEstado,
          notas: formNotas,
        };
        if (modoEdicion) {
          await api(`/mapas/unidades/${editandoId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          });
        } else {
          await api('/mapas/unidades', { method: 'POST', body: JSON.stringify(body) });
        }
      } else {
        const body = {
          rfcEmisor: formRfc,
          razonSocial: formRazonSocial,
          unidad: formUnidad,
          estado: formEstado,
          notas: formNotas,
        };
        if (modoEdicion) {
          await api(`/mapas/proveedores/${editandoId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          });
        } else {
          await api('/mapas/proveedores', { method: 'POST', body: JSON.stringify(body) });
        }
      }
      modalAbierto = false;
      mensaje = modoEdicion ? 'Entrada actualizada' : 'Entrada agregada';
      await cargarDatos();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo guardar';
    } finally {
      guardando = false;
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta entrada del mapa?')) return;
    const endpoint = tab === 'unidades' ? `/mapas/unidades/${id}` : `/mapas/proveedores/${id}`;
    try {
      await api(endpoint, { method: 'DELETE' });
      mensaje = 'Entrada eliminada';
      await cargarDatos();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo eliminar';
    }
  }

  async function alternarEstado(item: MapaUnidad | MapaProveedor) {
    const nuevoEstado = item.estado === 'confirmado' ? 'por_confirmar' : 'confirmado';
    const endpoint =
      tab === 'unidades'
        ? `/mapas/unidades/${item._id}`
        : `/mapas/proveedores/${item._id}`;
    const body =
      tab === 'unidades'
        ? {
            clienteRazonSocial: (item as MapaUnidad).clienteRazonSocial,
            unidad: item.unidad,
            estado: nuevoEstado,
            notas: item.notas ?? '',
          }
        : {
            rfcEmisor: (item as MapaProveedor).rfcEmisor ?? '',
            razonSocial: (item as MapaProveedor).razonSocial,
            unidad: item.unidad,
            estado: nuevoEstado,
            notas: item.notas ?? '',
          };
    await api(endpoint, { method: 'PUT', body: JSON.stringify(body) });
    await cargarDatos();
  }

  function etiquetaEstado(estado: Estado): string {
    return estado === 'confirmado' ? 'Confirmado' : 'Por confirmar';
  }
</script>

{#if cargando}
  <p class="estado">Cargando mapas de clasificación...</p>
{:else}
  <div class="modulo-contenido">
    {#if mensaje}
      <div class="alert alert-success">{mensaje}</div>
    {/if}
    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    <section class="card header-panel">
      <div>
        <h2>Mapas de clasificación</h2>
        <p class="subtitulo">
          Clientes (ingresos) y proveedores (egresos) por razón social. Strategy se agrupa como Consulting.
        </p>
      </div>
      {#if puedeEditar}
        <button class="btn btn-primary" onclick={abrirCrear}>Agregar entrada</button>
      {/if}
    </section>

    <div class="tabs">
      <button class:active={tab === 'unidades'} onclick={() => (tab = 'unidades')}>
        Clientes ({unidades.length})
      </button>
      <button class:active={tab === 'proveedores'} onclick={() => (tab = 'proveedores')}>
        Proveedores ({proveedores.length})
      </button>
    </div>

    {#if tab === 'unidades'}
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Unidad</th>
                <th>Estado</th>
                <th>Notas</th>
                {#if puedeEditar}<th></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each unidades as item}
                <tr>
                  <td><strong>{item.clienteRazonSocial}</strong></td>
                  <td>{item.unidad}</td>
                  <td>
                    <span class="badge" class:confirmado={item.estado === 'confirmado'} class:pendiente={item.estado === 'por_confirmar'}>
                      {etiquetaEstado(item.estado)}
                    </span>
                  </td>
                  <td>{item.notas || '—'}</td>
                  {#if puedeEditar}
                    <td class="acciones">
                      <button class="link" onclick={() => alternarEstado(item)}>Cambiar estado</button>
                      <button class="link" onclick={() => abrirEditarUnidad(item)}>Editar</button>
                      <button class="link peligro" onclick={() => eliminar(item._id)}>Eliminar</button>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {:else}
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Razón social</th>
                <th>RFC</th>
                <th>Unidad</th>
                <th>Estado</th>
                {#if puedeEditar}<th></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each proveedores as item}
                <tr>
                  <td><strong>{item.razonSocial}</strong></td>
                  <td>{item.rfcEmisor || '—'}</td>
                  <td>{item.unidad}</td>
                  <td>
                    <span class="badge" class:confirmado={item.estado === 'confirmado'} class:pendiente={item.estado === 'por_confirmar'}>
                      {etiquetaEstado(item.estado)}
                    </span>
                  </td>
                  {#if puedeEditar}
                    <td class="acciones">
                      <button class="link" onclick={() => alternarEstado(item)}>Cambiar estado</button>
                      <button class="link" onclick={() => abrirEditarProveedor(item)}>Editar</button>
                      <button class="link peligro" onclick={() => eliminar(item._id)}>Eliminar</button>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </div>
{/if}

<Modal abierto={modalAbierto} titulo={modoEdicion ? 'Editar entrada' : 'Nueva entrada'} onCerrar={() => (modalAbierto = false)}>
  <div class="form-grid">
    {#if tab === 'unidades'}
      <div class="form-group">
        <label class="label" for="cliente">Cliente (razón social)</label>
        <input id="cliente" class="input" bind:value={formCliente} />
      </div>
    {:else}
      <div class="form-group">
        <label class="label" for="razon">Razón social</label>
        <input id="razon" class="input" bind:value={formRazonSocial} />
      </div>
      <div class="form-group">
        <label class="label" for="rfc">RFC (opcional)</label>
        <input id="rfc" class="input" bind:value={formRfc} />
      </div>
    {/if}
    <div class="form-group">
      <label class="label" for="unidad">Unidad</label>
      <select id="unidad" class="select" bind:value={formUnidad}>
        <option value="Consulting">Consulting</option>
        <option value="Technologies">Technologies</option>
        <option value="Grupo">Grupo</option>
      </select>
    </div>
    <div class="form-group">
      <label class="label" for="estado">Estado</label>
      <select id="estado" class="select" bind:value={formEstado}>
        <option value="confirmado">Confirmado</option>
        <option value="por_confirmar">Por confirmar</option>
      </select>
    </div>
    <div class="form-group full">
      <label class="label" for="notas">Notas</label>
      <input id="notas" class="input" bind:value={formNotas} />
    </div>
  </div>
  <div class="modal-actions">
    <button class="btn btn-secondary" onclick={() => (modalAbierto = false)}>Cancelar</button>
    <button class="btn btn-primary" disabled={guardando} onclick={guardar}>
      {guardando ? 'Guardando...' : 'Guardar'}
    </button>
  </div>
</Modal>

<style>
  .modulo-contenido { display: flex; flex-direction: column; gap: 1rem; }
  .header-panel { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; padding: 1rem 1.25rem; }
  .header-panel h2 { font-size: 1.05rem; margin-bottom: 0.25rem; }
  .subtitulo { color: var(--color-text-muted); font-size: 0.85rem; }
  .tabs { display: flex; gap: 0.5rem; }
  .tabs button { border: 1px solid var(--color-border); background: white; padding: 0.5rem 1rem; border-radius: 999px; cursor: pointer; }
  .tabs button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
  .card { padding: 1rem; }
  .badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px; }
  .badge.confirmado { background: #dcfce7; color: #166534; }
  .badge.pendiente { background: #fef9c3; color: #854d0e; }
  .acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .link { background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 0.8rem; }
  .link.peligro { color: var(--color-danger); }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .form-grid .full { grid-column: 1 / -1; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  .estado { color: var(--color-text-muted); }
</style>
