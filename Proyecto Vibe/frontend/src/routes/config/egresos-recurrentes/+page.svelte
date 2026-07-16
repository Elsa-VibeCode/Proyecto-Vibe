<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMonedaPanel } from '$lib/types/panel';

  interface Recurrente {
    _id: string;
    nombre: string;
    tipoGasto: string;
    proveedorEsperado: string;
    unidad: string;
    frecuencia: string;
    diaEsperado?: number;
    montoReferencia?: number;
    tolerancia?: number;
    activo: boolean;
  }

  let items = $state<Recurrente[]>([]);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const data = await api<{ ok: boolean; data: { recurrentes: Recurrente[] } }>(
        '/egresos-recurrentes'
      );
      items = data.data.recurrentes;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar';
    } finally {
      cargando = false;
    }
  }

  onMount(cargar);

  async function toggleActivo(item: Recurrente) {
    try {
      await api(`/egresos-recurrentes/${item._id}/activo`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !item.activo }),
      });
      item.activo = !item.activo;
      mensaje = 'Actualizado';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al actualizar';
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Egresos recurrentes</h1>
      <p>Catálogo usado por el Panel para alertas de pagos faltantes o con variación</p>
    </div>
    <div class="actions">
      <a href="/config" class="btn btn-secondary">← Config</a>
      <a href="/panel" class="btn btn-secondary">Panel</a>
    </div>
  </header>

  {#if mensaje}
    <div class="alert ok">{mensaje}</div>
  {/if}
  {#if error}
    <div class="alert err">{error}</div>
  {/if}

  {#if cargando}
    <p>Cargando…</p>
  {:else}
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Activo</th>
            <th>Nombre</th>
            <th>Tipo gasto</th>
            <th>Proveedor</th>
            <th>Día</th>
            <th class="num">Monto ref.</th>
            <th>Tolerancia</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item}
            <tr class:inactive={!item.activo}>
              <td>
                <button
                  type="button"
                  class="toggle"
                  class:on={item.activo}
                  onclick={() => toggleActivo(item)}
                  aria-label={item.activo ? 'Desactivar' : 'Activar'}
                >
                  {item.activo ? 'ON' : 'OFF'}
                </button>
              </td>
              <td>{item.nombre}</td>
              <td>{item.tipoGasto}</td>
              <td>{item.proveedorEsperado}</td>
              <td>{item.diaEsperado ?? '—'}</td>
              <td class="num">{item.montoReferencia ? formatearMonedaPanel(item.montoReferencia) : '—'}</td>
              <td>{item.tolerancia != null ? `${Math.round(item.tolerancia * 100)}%` : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="hint">
      Para poblar el catálogo inicial: <code>npm run seed:egresos-recurrentes</code> en <code>backend/</code>
    </p>
  {/if}
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .actions { display: flex; gap: 0.5rem; }
  .table-wrap { padding: 0; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  .num { text-align: right; }
  tr.inactive { opacity: 0.55; }
  .toggle {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: #f1f5f9;
    cursor: pointer;
  }
  .toggle.on { background: #dcfce7; color: #166534; border-color: #86efac; }
  .hint { margin-top: 1rem; font-size: 0.85rem; color: var(--color-text-muted); }
  .alert.ok { padding: 0.75rem; background: #ecfdf5; color: #047857; border-radius: var(--radius); margin-bottom: 1rem; }
  .alert.err { padding: 0.75rem; background: #fef2f2; color: #b91c1c; border-radius: var(--radius); margin-bottom: 1rem; }
</style>
