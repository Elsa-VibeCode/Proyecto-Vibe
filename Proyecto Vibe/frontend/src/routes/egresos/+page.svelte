<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, apiSubirArchivo } from '$lib/api';
  import { formatearMoneda } from '$lib/utils';
  import EgresoForm from '$lib/components/EgresoForm.svelte';
  import {
    UNIDADES,
    type Egreso,
    type Paginacion,
    type TotalesUnidad,
    type TipoGasto,
  } from '$lib/types/egresos';

  type Vista = 'lista' | 'form';

  let vista = $state<Vista>('lista');
  let egresos = $state<Egreso[]>([]);
  let paginacion = $state<Paginacion | null>(null);
  let totales = $state<TotalesUnidad | null>(null);
  let tiposGasto = $state<TipoGasto[]>([]);

  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');
  let guardando = $state(false);
  let importando = $state(false);

  let egresoEditando = $state<Egreso | null>(null);

  // Filtros
  const mesActual = new Date().toISOString().slice(0, 7);
  let fMes = $state(mesActual);
  let fUnidad = $state('');
  let fTipoGasto = $state('');
  let fBusqueda = $state('');
  let pagina = $state(1);

  let fileInput: HTMLInputElement;

  async function cargar() {
    cargando = true;
    error = '';
    const params = new URLSearchParams({ pagina: String(pagina), limite: '50' });
    if (fMes) params.set('mes', fMes);
    if (fUnidad) params.set('unidad', fUnidad);
    if (fTipoGasto) params.set('tipoGasto', fTipoGasto);
    if (fBusqueda) params.set('q', fBusqueda);

    try {
      const [lista, tot] = await Promise.all([
        api<{ egresos: Egreso[]; paginacion: Paginacion }>(`/egresos?${params}`),
        api<TotalesUnidad>(`/egresos/totales?mes=${fMes}`),
      ]);
      egresos = lista.egresos;
      paginacion = lista.paginacion;
      totales = tot;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar egresos';
    } finally {
      cargando = false;
    }
  }

  onMount(async () => {
    const mesUrl = $page.url.searchParams.get('mes');
    if (mesUrl && /^\d{4}-\d{2}$/.test(mesUrl)) fMes = mesUrl;

    try {
      const tg = await api<{ tipos: TipoGasto[] }>('/tipos-gasto?activos=1');
      tiposGasto = tg.tipos;
    } catch {
      /* catálogo opcional */
    }
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

  function nuevoEgreso() {
    egresoEditando = null;
    vista = 'form';
  }

  function editarEgreso(egreso: Egreso) {
    egresoEditando = egreso;
    vista = 'form';
  }

  async function guardarEgreso(datos: Egreso) {
    guardando = true;
    error = '';
    mensaje = '';
    try {
      if (egresoEditando?._id) {
        await api(`/egresos/${egresoEditando._id}`, { method: 'PUT', body: JSON.stringify(datos) });
        mensaje = 'Egreso actualizado correctamente';
      } else {
        await api('/egresos', { method: 'POST', body: JSON.stringify(datos) });
        mensaje = 'Egreso creado correctamente';
      }
      vista = 'lista';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar el egreso';
    } finally {
      guardando = false;
    }
  }

  async function eliminarEgreso(egreso: Egreso) {
    if (!egreso._id || !confirm(`¿Eliminar el egreso "${egreso.concepto}"?`)) return;
    error = '';
    try {
      await api(`/egresos/${egreso._id}`, { method: 'DELETE' });
      mensaje = 'Egreso eliminado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar';
    }
  }

  async function importarExcel(e: Event) {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    importando = true;
    error = '';
    mensaje = '';
    try {
      const res = await apiSubirArchivo<{ mensaje: string; creados: number; omitidos: number }>(
        '/egresos/import',
        archivo
      );
      mensaje = res.mensaje;
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al importar el archivo';
    } finally {
      importando = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function fechaCorta(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>💸 Egresos</h1>
      <p>Captura y control de egresos por unidad, proveedor y tipo de gasto</p>
    </div>
    <div class="header-actions">
      <button
        class="btn btn-secondary"
        onclick={() => fileInput?.click()}
        disabled={importando}
      >
        {importando ? 'Importando...' : 'Importar Excel'}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".xlsx,.xls"
        onchange={importarExcel}
        hidden
      />
      <button class="btn btn-primary" onclick={nuevoEgreso}>+ Nuevo egreso</button>
    </div>
  </header>

  <div class="tabs">
    <button class:active={vista === 'lista'} onclick={() => (vista = 'lista')}>Lista</button>
    <button class:active={vista === 'form'} onclick={nuevoEgreso}>
      {egresoEditando ? 'Editar' : 'Nuevo'}
    </button>
  </div>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if vista === 'form'}
    <div class="card form-card">
      <EgresoForm
        egreso={egresoEditando}
        {guardando}
        onGuardar={guardarEgreso}
        onCancelar={() => (vista = 'lista')}
      />
    </div>
  {:else}
    {#if totales}
      <div class="totales">
        <div class="stat-card card">
          <span class="stat-label">Total del mes</span>
          <span class="stat-value">{formatearMoneda(totales.total)}</span>
        </div>
        <div class="stat-card card">
          <span class="stat-label">Grupo</span>
          <span class="stat-value">{formatearMoneda(totales.grupo)}</span>
        </div>
        <div class="stat-card card">
          <span class="stat-label">Consulting</span>
          <span class="stat-value">{formatearMoneda(totales.consulting)}</span>
        </div>
        <div class="stat-card card">
          <span class="stat-label">Technologies</span>
          <span class="stat-value">{formatearMoneda(totales.technologies)}</span>
        </div>
      </div>
    {/if}

    <div class="filtros card">
      <input class="input" type="month" bind:value={fMes} onchange={aplicarFiltros} />
      <select class="select" bind:value={fUnidad} onchange={aplicarFiltros}>
        <option value="">Todas las unidades</option>
        {#each UNIDADES as u}
          <option value={u}>{u}</option>
        {/each}
      </select>
      <select class="select" bind:value={fTipoGasto} onchange={aplicarFiltros}>
        <option value="">Todos los tipos</option>
        {#each tiposGasto as tg}
          <option value={tg.nombre}>{tg.nombre}</option>
        {/each}
      </select>
      <input
        class="input"
        type="search"
        placeholder="Buscar proveedor, concepto, factura..."
        bind:value={fBusqueda}
        onkeydown={(e) => e.key === 'Enter' && aplicarFiltros()}
      />
      <button class="btn btn-secondary" onclick={aplicarFiltros}>Buscar</button>
    </div>

    <div class="card tabla-container">
      {#if cargando}
        <p class="estado">Cargando egresos...</p>
      {:else if egresos.length === 0}
        <p class="estado">No hay egresos para los filtros seleccionados.</p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Unidad</th>
                <th>Tipo de gasto</th>
                <th>Proveedor</th>
                <th>Concepto</th>
                <th class="num">Subtotal</th>
                <th class="num">Impuesto</th>
                <th class="num">Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {#each egresos as egreso}
                <tr>
                  <td>{fechaCorta(egreso.fechaGasto)}</td>
                  <td>{egreso.unidad}</td>
                  <td>
                    {egreso.tipoGasto}
                    {#if egreso.esTransferLatam}<span class="badge badge-latam">LATAM</span>{/if}
                  </td>
                  <td>{egreso.proveedor}</td>
                  <td>{egreso.concepto}</td>
                  <td class="num">{formatearMoneda(egreso.subtotal)}</td>
                  <td class="num">{formatearMoneda(egreso.impuesto)}</td>
                  <td class="num"><strong>{formatearMoneda(egreso.total)}</strong></td>
                  <td class="acciones">
                    <button class="btn btn-secondary btn-sm" onclick={() => editarEgreso(egreso)}>
                      Editar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick={() => eliminarEgreso(egreso)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if paginacion && paginacion.paginas > 1}
          <div class="paginacion">
            <button class="btn btn-secondary" disabled={pagina <= 1} onclick={() => cambiarPagina(pagina - 1)}>
              Anterior
            </button>
            <span>Página {paginacion.pagina} de {paginacion.paginas} ({paginacion.total} egresos)</span>
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
  {/if}
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

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .tabs button {
    padding: 0.6rem 1rem;
    font-weight: 600;
    color: var(--color-text-muted);
    border-bottom: 2px solid transparent;
  }

  .tabs button.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .alert {
    margin-bottom: 1rem;
  }

  .form-card {
    padding: 1.5rem;
  }

  .totales {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    padding: 1.1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .stat-value {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--color-primary);
  }

  .filtros {
    display: grid;
    grid-template-columns: auto auto auto 1fr auto;
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

  .acciones {
    display: flex;
    gap: 0.5rem;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  .badge-latam {
    background: #fef3c7;
    color: #92400e;
    margin-left: 0.4rem;
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
