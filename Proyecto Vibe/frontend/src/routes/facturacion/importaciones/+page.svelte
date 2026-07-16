<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearFecha } from '$lib/utils';

  interface ImportacionLog {
    _id: string;
    fuente: string;
    usuario: string;
    nombreArchivo: string;
    totalFilas: number;
    creadas: number;
    actualizadas: number;
    ignoradas: number;
    errores: { fila: number; mensaje: string }[];
    estrategiaDuplicados: string;
    createdAt: string;
  }

  let importaciones = $state<ImportacionLog[]>([]);
  let cargando = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const res = await api<{ ok: boolean; data: { importaciones: ImportacionLog[] } }>(
        '/facturas/importaciones'
      );
      importaciones = res.data?.importaciones ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo cargar el historial';
    } finally {
      cargando = false;
    }
  });
</script>

<svelte:head>
  <title>Importaciones Sicofi — AdminSys</title>
</svelte:head>

<div class="page-header">
  <div>
    <h1>Historial de importaciones Sicofi</h1>
    <p>Registro de cargas CSV desde cfd.sicofi.com.mx</p>
  </div>
  <a href="/facturacion" class="btn btn-secondary">← Volver a facturación</a>
</div>

{#if cargando}
  <p class="estado">Cargando...</p>
{:else if error}
  <div class="alert alert-error">{error}</div>
{:else if importaciones.length === 0}
  <p class="estado card">Aún no hay importaciones registradas.</p>
{:else}
  <div class="tabla-scroll card">
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Archivo</th>
          <th>Filas</th>
          <th>Creadas</th>
          <th>Actualizadas</th>
          <th>Ignoradas</th>
          <th>Errores</th>
          <th>Estrategia</th>
        </tr>
      </thead>
      <tbody>
        {#each importaciones as imp}
          <tr>
            <td>{formatearFecha(imp.createdAt)}</td>
            <td>{imp.nombreArchivo || '—'}</td>
            <td>{imp.totalFilas}</td>
            <td>{imp.creadas}</td>
            <td>{imp.actualizadas}</td>
            <td>{imp.ignoradas}</td>
            <td>{imp.errores?.length ?? 0}</td>
            <td>{imp.estrategiaDuplicados}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .tabla-scroll {
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th,
  td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
  }

  th {
    background: var(--color-bg);
  }

  .estado {
    color: var(--color-text-muted);
    padding: 1rem;
  }

  .alert-error {
    background: #fef2f2;
    color: #b91c1c;
    padding: 0.75rem 1rem;
    border-radius: 8px;
  }
</style>
