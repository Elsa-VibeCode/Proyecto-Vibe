<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/utils';
  import type { Complemento, PaginacionComplementos } from '$lib/types/complementos';
  import { UNIDADES_COMPLEMENTO, type ApiResponse } from '$lib/types/complementos';

  let complementos = $state<Complemento[]>([]);
  let paginacion = $state<PaginacionComplementos | null>(null);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');

  const mesActual = new Date().toISOString().slice(0, 7);
  let fMes = $state(mesActual);
  let fUnidad = $state('');
  let fCliente = $state('');
  let fEstatus = $state('');
  let pagina = $state(1);

  let puedeEditar = $derived($auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor');

  async function cargar() {
    cargando = true;
    error = '';
    const params = new URLSearchParams({ pagina: String(pagina), limite: '50' });
    if (fMes) params.set('mes', fMes);
    if (fUnidad) params.set('unidad', fUnidad);
    if (fCliente) params.set('cliente', fCliente);
    if (fEstatus) params.set('estatus', fEstatus);

    try {
      const res = await api<
        ApiResponse<{ complementos: Complemento[]; paginacion: PaginacionComplementos }>
      >(`/complementos?${params}`);
      complementos = res.data?.complementos ?? [];
      paginacion = res.data?.paginacion ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar complementos';
    } finally {
      cargando = false;
    }
  }

  onMount(async () => {
    const sp = $page.url.searchParams;
    const mesUrl = sp.get('mes');
    if (mesUrl && /^\d{4}-\d{2}$/.test(mesUrl)) fMes = mesUrl;
    if (sp.get('vencidas') === 'true') fEstatus = 'vencidos';
    if (sp.get('estatus') === 'pendientes') fEstatus = 'pendientes';
    await cargar();
  });

  function aplicarFiltros() {
    pagina = 1;
    cargar();
  }

  function cambiarPagina(nueva: number) {
    pagina = nueva;
    cargar();
  }

  async function eliminar(comp: Complemento) {
    if (!comp._id || !confirm(`¿Eliminar el complemento "${comp.folio}"?`)) return;
    error = '';
    try {
      await api(`/complementos/${comp._id}`, { method: 'DELETE' });
      mensaje = 'Complemento eliminado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar';
    }
  }

  function fechaCorta(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
  }

  function facturasTexto(comp: Complemento): string {
    return comp.facturasRelacionadas
      ?.map((r) => r.noFactura || r.facturaId)
      .filter(Boolean)
      .join(', ') || '—';
  }
</script>

<svelte:head>
  <title>Complementos de pago — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>📄 Complementos de pago (REP)</h1>
      <p>Registro de recibos electrónicos de pago vinculados a facturas PPD</p>
    </div>
    {#if puedeEditar}
      <div class="header-actions">
        <a href="/complementos/importar" class="btn btn-secondary">Importar Sicofi</a>
        <a href="/complementos/nuevo" class="btn btn-primary">+ Nuevo complemento</a>
      </div>
    {/if}
  </header>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="filtros card">
    <input class="input" type="month" bind:value={fMes} onchange={aplicarFiltros} />
    <select class="select" bind:value={fUnidad} onchange={aplicarFiltros}>
      <option value="">Todas las unidades</option>
      {#each UNIDADES_COMPLEMENTO as u}
        <option value={u}>{u}</option>
      {/each}
    </select>
    <input
      class="input"
      type="search"
      placeholder="Cliente..."
      bind:value={fCliente}
      onkeydown={(e) => e.key === 'Enter' && aplicarFiltros()}
    />
    <select class="select" bind:value={fEstatus} onchange={aplicarFiltros}>
      <option value="">Todos</option>
      <option value="pendientes">Con facturas pendientes</option>
      <option value="vencidos">Vencidos (plazo SAT)</option>
    </select>
    <button class="btn btn-secondary" onclick={aplicarFiltros}>Buscar</button>
  </div>

  <div class="card tabla-container">
    {#if cargando}
      <p class="estado">Cargando complementos...</p>
    {:else if complementos.length === 0}
      <p class="estado">No hay complementos para los filtros seleccionados.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha pago</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th class="num">Monto</th>
              <th>Facturas</th>
              <th>Origen</th>
              {#if puedeEditar}
                <th>Acciones</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each complementos as comp}
              <tr>
                <td><strong>{comp.folio}</strong></td>
                <td>{fechaCorta(comp.fechaPago)}</td>
                <td>{comp.cliente || '—'}</td>
                <td>{comp.unidad || '—'}</td>
                <td class="num">{formatearMoneda(comp.monto)}</td>
                <td class="facturas-col">{facturasTexto(comp)}</td>
                <td>{comp.origen === 'sicofi_import' ? 'Sicofi' : 'Manual'}</td>
                {#if puedeEditar}
                  <td class="acciones">
                    <button class="btn btn-danger btn-sm" onclick={() => eliminar(comp)}>
                      Eliminar
                    </button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if paginacion && paginacion.paginas > 1}
        <div class="paginacion">
          <button
            class="btn btn-secondary"
            disabled={pagina <= 1}
            onclick={() => cambiarPagina(pagina - 1)}
          >
            Anterior
          </button>
          <span>
            Página {paginacion.pagina} de {paginacion.paginas} ({paginacion.total} complementos)
          </span>
          <button
            class="btn btn-secondary"
            disabled={pagina >= paginacion.paginas}
            onclick={() => cambiarPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.25rem;
    gap: 1rem;
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

  .header-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .header-actions .btn {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }

  .alert {
    margin-bottom: 1rem;
  }

  .filtros {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
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

  .num {
    text-align: right;
    white-space: nowrap;
  }

  .facturas-col {
    max-width: 14rem;
    font-size: 0.85rem;
  }

  .acciones {
    display: flex;
    gap: 0.5rem;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  .paginacion {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }

  @media (max-width: 900px) {
    .filtros {
      grid-template-columns: 1fr;
    }
  }
</style>
