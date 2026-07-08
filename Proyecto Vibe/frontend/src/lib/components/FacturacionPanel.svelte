<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { FiltrosFacturacion, ResumenModulo } from '$lib/types/admin';
  import { filtrosFacturacionVacios } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let error = $state('');
  let cargando = $state(true);
  let filtros = $state<FiltrosFacturacion>(filtrosFacturacionVacios());
  let opcionesFiltro = $state({ clientes: [] as string[], areas: [] as string[], estatus: [] as string[] });

  let clientes = $derived(opcionesFiltro.clientes);
  let areas = $derived(opcionesFiltro.areas);
  let estatusOpciones = $derived(opcionesFiltro.estatus);

  let columnasTabla = $derived(() => {
    if (!resumen?.mapeo) return [];
    return [
      resumen.mapeo.fechaFacturacion,
      resumen.mapeo.noFactura,
      resumen.mapeo.cliente,
      resumen.mapeo.conceptoFactura,
      resumen.mapeo.areaVenta,
      resumen.mapeo.total,
      resumen.mapeo.estatusPago,
    ].filter(Boolean) as string[];
  });

  function extraerOpciones(data: ResumenModulo) {
    const m = data.mapeo;
    const filas = data.filas ?? [];
    return {
      clientes: m.cliente
        ? [...new Set(filas.map((f) => String(f[m.cliente!] ?? '').trim()).filter(Boolean))].sort()
        : [],
      areas: m.areaVenta
        ? [...new Set(filas.map((f) => String(f[m.areaVenta!] ?? '').trim()).filter(Boolean))].sort()
        : [],
      estatus: m.estatusPago
        ? [...new Set(filas.map((f) => String(f[m.estatusPago!] ?? '').trim()).filter(Boolean))].sort()
        : [],
    };
  }

  async function cargarDatos(cargarOpciones = false) {
    cargando = true;
    error = '';

    const params = new URLSearchParams();
    if (filtros.cliente) params.set('cliente', filtros.cliente);
    if (filtros.areaVenta) params.set('areaVenta', filtros.areaVenta);
    if (filtros.estatusPago) params.set('estatusPago', filtros.estatusPago);
    if (filtros.totalMin) params.set('totalMin', filtros.totalMin);
    if (filtros.totalMax) params.set('totalMax', filtros.totalMax);

    const query = params.toString();
    const endpoint = `/excel/ultima/facturacion${query ? `?${query}` : ''}`;

    try {
      resumen = await api<ResumenModulo>(endpoint);
      if (cargarOpciones && resumen) {
        opcionesFiltro = extraerOpciones(resumen);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar facturación';
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  onMount(() => {
    cargarDatos(true);
  });

  function aplicarFiltros() {
    cargarDatos(false);
  }

  function limpiarFiltros() {
    filtros = filtrosFacturacionVacios();
    cargarDatos(false);
  }

  function valorCelda(fila: Record<string, unknown>, columna: string): string {
    const valor = fila[columna];
    if (columna === resumen?.mapeo.total) {
      const numero = Number(String(valor ?? '').replace(/[$,\s]/g, ''));
      return Number.isFinite(numero) ? formatearMoneda(numero) : String(valor ?? '');
    }
    return valor === null || valor === undefined ? '' : String(valor);
  }
</script>

{#if cargando}
  <p class="estado">Cargando facturación...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">
      Importa la hoja <strong>FACTURACION INGRESOS</strong> desde
      <a href="/datos-excel">Datos Excel</a>.
    </p>
  </div>
{:else if resumen?.facturacion}
  <div class="modulo-contenido">
    <div class="meta-info card">
      <p>
        <strong>{resumen.importacion.nombreArchivo}</strong> · {resumen.importacion.nombreHoja} ·
        {resumen.totalFilas} facturas mostradas
      </p>
    </div>

    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">Total facturado</span>
        <span class="stat-value">{formatearMoneda(resumen.facturacion.totalFacturado)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Pagado</span>
        <span class="stat-value activo">{formatearMoneda(resumen.facturacion.totalPagado)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Pendiente</span>
        <span class="stat-value inactivo">{formatearMoneda(resumen.facturacion.totalPendiente)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Facturas</span>
        <span class="stat-value">{resumen.facturacion.facturas}</span>
      </div>
    </div>

    <section class="card filtros-panel">
      <div class="filtros-header">
        <h3>Filtros</h3>
        <button type="button" class="link" onclick={limpiarFiltros}>Limpiar</button>
      </div>
      <div class="filtros-grid">
        <div class="form-group">
          <label class="label" for="f-cliente">Cliente</label>
          <select id="f-cliente" class="select" bind:value={filtros.cliente}>
            <option value="">Todos</option>
            {#each clientes as cliente}
              <option value={cliente}>{cliente}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-area">Área de venta</label>
          <select id="f-area" class="select" bind:value={filtros.areaVenta}>
            <option value="">Todas</option>
            {#each areas as area}
              <option value={area}>{area}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-estatus">Estatus de pago</label>
          <select id="f-estatus" class="select" bind:value={filtros.estatusPago}>
            <option value="">Todos</option>
            {#each estatusOpciones as estatus}
              <option value={estatus}>{estatus}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-min">Monto mínimo</label>
          <input id="f-min" class="input" type="number" bind:value={filtros.totalMin} placeholder="Ej. 10000" />
        </div>
        <div class="form-group">
          <label class="label" for="f-max">Monto máximo</label>
          <input id="f-max" class="input" type="number" bind:value={filtros.totalMax} placeholder="Ej. 500000" />
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick={aplicarFiltros}>Aplicar filtros</button>
    </section>

    <div class="resumenes-grid">
      <section class="card">
        <h3>Top clientes</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Facturas</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {#each resumen.facturacion.porCliente as item}
                <tr>
                  <td>{item.nombre}</td>
                  <td>{item.facturas}</td>
                  <td>{formatearMoneda(item.monto)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3>Por área de venta</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Área</th><th>Facturas</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {#each resumen.facturacion.porArea as item}
                <tr>
                  <td>{item.nombre}</td>
                  <td>{item.facturas}</td>
                  <td>{formatearMoneda(item.monto)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="card tabla-detalle">
      <h3>Detalle de facturas</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {#each columnasTabla() as columna}
                <th>{columna}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each resumen.filas ?? [] as fila}
              <tr>
                {#each columnasTabla() as columna}
                  <td>{valorCelda(fila, columna)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
{/if}

<style>
  .modulo-contenido { display: flex; flex-direction: column; gap: 1.25rem; }
  .meta-info { padding: 0.875rem 1rem; font-size: 0.875rem; color: var(--color-text-muted); }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
  .stat-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.35rem; font-weight: 700; color: var(--color-primary); }
  .stat-value.activo { color: var(--color-success); }
  .stat-value.inactivo { color: var(--color-danger); }
  .filtros-panel { padding: 1rem; }
  .filtros-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .filtros-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
  .resumenes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
  .resumenes-grid .card, .tabla-detalle { padding: 1rem; }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }
  .link { color: var(--color-primary); font-weight: 600; background: none; border: none; cursor: pointer; }
  .btn-sm { margin-top: 0.25rem; }
</style>
