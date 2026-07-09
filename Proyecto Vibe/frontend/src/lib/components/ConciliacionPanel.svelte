<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { ConciliacionPeriodo, FiltrosConciliacion, ResumenModulo } from '$lib/types/admin';
  import { filtrosConciliacionVacios } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let conciliaciones = $state<ConciliacionPeriodo[]>([]);
  let periodoSeleccionado = $state('');
  let error = $state('');
  let cargando = $state(true);
  let filtros = $state<FiltrosConciliacion>(filtrosConciliacionVacios());

  let columnasTabla = $derived(() => {
    if (!resumen?.mapeo) return [];
    const m = resumen.mapeo;
    return [m.fechaMovimiento, m.conceptoMovimiento, m.contraparte, m.cargo, m.abono, m.enFacturas].filter(Boolean) as string[];
  });

  async function cargarPeriodos() {
    const data = await api<{ conciliaciones: ConciliacionPeriodo[] }>('/excel/conciliaciones');
    conciliaciones = data.conciliaciones;

    if (data.conciliaciones.length === 0) {
      throw new Error('No hay conciliaciones importadas.');
    }

    if (!periodoSeleccionado) {
      periodoSeleccionado = data.conciliaciones[data.conciliaciones.length - 1]?.periodo ?? '';
    } else if (!data.conciliaciones.some((c) => c.periodo === periodoSeleccionado)) {
      periodoSeleccionado = data.conciliaciones[data.conciliaciones.length - 1]?.periodo ?? '';
    }
  }

  async function cargarDatos() {
    cargando = true;
    error = '';

    try {
      await cargarPeriodos();

      const params = new URLSearchParams();
      if (periodoSeleccionado) params.set('periodo', periodoSeleccionado);
      if (filtros.enFacturas) params.set('enFacturas', filtros.enFacturas);
      const query = params.toString();
      const endpoint = `/excel/ultima/conciliacion${query ? `?${query}` : ''}`;

      const data = await api<ResumenModulo>(endpoint);
      resumen = data;
      if (data.conciliacionesDisponibles?.length) {
        conciliaciones = data.conciliacionesDisponibles;
      }
      if (data.conciliacion?.periodo) {
        periodoSeleccionado = data.conciliacion.periodo;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar conciliación';
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  onMount(() => cargarDatos());

  function valorCelda(fila: Record<string, unknown>, columna: string): string {
    const valor = fila[columna];
    if (valor === null || valor === undefined || valor === '') return '—';
    const monto = Number(String(valor).replace(/[$,\s]/g, ''));
    if (Number.isFinite(monto) && (columna.toLowerCase().includes('cargo') || columna.toLowerCase().includes('abono'))) {
      return formatearMoneda(monto);
    }
    return String(valor);
  }

  function claseDiferencia(valor: number): string {
    if (valor === 0) return 'neutro';
    return valor > 0 ? 'positivo' : 'negativo';
  }

  function etiquetaPeriodo(item: ConciliacionPeriodo): string {
    const dif = item.diferenciaCargos ?? item.diferenciaAbonos;
    if (dif === null || dif === 0) return item.periodo;
    return `${item.periodo} (dif. ${formatearMoneda(dif)})`;
  }
</script>

{#if cargando}
  <p class="estado">Cargando conciliación bancaria...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">
      Importa hojas como <strong>Conciliación Enero</strong>, <strong>Conciliación Febrero</strong> o
      <strong>Conciliación Marzo</strong> desde <a href="/datos-excel">Datos Excel</a>.
      Cada mes se guarda por separado.
    </p>
  </div>
{:else if resumen?.conciliacion}
  {@const c = resumen.conciliacion}
  <div class="modulo-contenido">
    <section class="card selector-panel">
      <div class="selector-header">
        <div>
          <h2>Conciliación por mes</h2>
          <p class="subtitulo">
            {conciliaciones.length} mes{conciliaciones.length === 1 ? '' : 'es'} guardado{conciliaciones.length === 1 ? '' : 's'}.
            Al reimportar un mes, se usa la versión más reciente.
          </p>
        </div>
        <div class="form-group periodo-selector">
          <label class="label" for="periodo-conciliacion">Periodo</label>
          <select
            id="periodo-conciliacion"
            class="select"
            bind:value={periodoSeleccionado}
            onchange={cargarDatos}
          >
            {#each conciliaciones as item}
              <option value={item.periodo}>{etiquetaPeriodo(item)}</option>
            {/each}
          </select>
        </div>
      </div>
    </section>

    <div class="meta-info card">
      <p>
        <strong>{resumen.importacion.nombreArchivo}</strong> · {resumen.importacion.nombreHoja}
        {#if c.periodo}· Periodo: {c.periodo}{/if}
        {#if resumen.importacion.createdAt}
          · Importado: {new Date(resumen.importacion.createdAt).toLocaleDateString('es-MX')}
        {/if}
      </p>
    </div>

    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">Saldo inicial</span>
        <span class="stat-value">{formatearMoneda(c.saldoInicialBanco)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Saldo final banco</span>
        <span class="stat-value">{formatearMoneda(c.saldoFinalBanco)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Dif. abonos</span>
        <span class="stat-value {claseDiferencia(c.diferenciaAbonos)}">{formatearMoneda(c.diferenciaAbonos)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Dif. cargos</span>
        <span class="stat-value {claseDiferencia(c.diferenciaCargos)}">{formatearMoneda(c.diferenciaCargos)}</span>
      </div>
    </div>

    {#if conciliaciones.length > 1}
      <section class="card resumen-meses">
        <h3>Resumen por mes</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Movimientos</th>
                <th>Saldo final</th>
                <th>Dif. cargos</th>
                <th>Dif. abonos</th>
              </tr>
            </thead>
            <tbody>
              {#each conciliaciones as item}
                <tr class:mes-activo={item.periodo === periodoSeleccionado}>
                  <td>
                    <button type="button" class="link-mes" onclick={() => { periodoSeleccionado = item.periodo; cargarDatos(); }}>
                      <strong>{item.periodo}</strong>
                    </button>
                  </td>
                  <td>{item.totalFilas}</td>
                  <td>{item.saldoFinalBanco !== null ? formatearMoneda(item.saldoFinalBanco) : '—'}</td>
                  <td class={claseDiferencia(item.diferenciaCargos ?? 0)}>
                    {item.diferenciaCargos !== null ? formatearMoneda(item.diferenciaCargos) : '—'}
                  </td>
                  <td class={claseDiferencia(item.diferenciaAbonos ?? 0)}>
                    {item.diferenciaAbonos !== null ? formatearMoneda(item.diferenciaAbonos) : '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <div class="resumenes-grid">
      <section class="card">
        <h3>Abonos / Ingresos</h3>
        <div class="comparativa">
          <div><span>Banco BBVA</span><strong>{formatearMoneda(c.abonosBanco)}</strong></div>
          <div><span>Nuestra hoja</span><strong>{formatearMoneda(c.abonosHoja)}</strong></div>
          <div><span>Diferencia</span><strong class={claseDiferencia(c.diferenciaAbonos)}>{formatearMoneda(c.diferenciaAbonos)}</strong></div>
        </div>
      </section>
      <section class="card">
        <h3>Cargos / Egresos</h3>
        <div class="comparativa">
          <div><span>Banco BBVA</span><strong>{formatearMoneda(c.cargosBanco)}</strong></div>
          <div><span>Nuestra hoja</span><strong>{formatearMoneda(c.cargosHoja)}</strong></div>
          <div><span>Diferencia</span><strong class={claseDiferencia(c.diferenciaCargos)}>{formatearMoneda(c.diferenciaCargos)}</strong></div>
        </div>
      </section>
      <section class="card">
        <h3>En facturas</h3>
        <div class="comparativa">
          <div><span>Con factura</span><strong class="activo">{c.conFactura}</strong></div>
          <div><span>Sin factura</span><strong class="inactivo">{c.sinFactura}</strong></div>
          <div><span>Movimientos</span><strong>{c.movimientos}</strong></div>
        </div>
      </section>
    </div>

    <section class="card filtros-panel">
      <div class="filtros-grid">
        <div class="form-group">
          <label class="label" for="f-facturas">¿En facturas?</label>
          <select id="f-facturas" class="select" bind:value={filtros.enFacturas}>
            <option value="">Todos</option>
            <option value="Sí">Sí</option>
            <option value="No">No</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick={cargarDatos}>Aplicar filtros</button>
    </section>

    <section class="card tabla-detalle">
      <h3>Movimientos bancarios — {c.periodo}</h3>
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
  .selector-panel { padding: 1rem 1.25rem; }
  .selector-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
  .selector-header h2 { font-size: 1.05rem; margin-bottom: 0.25rem; }
  .subtitulo { color: var(--color-text-muted); font-size: 0.85rem; }
  .periodo-selector { min-width: 220px; }
  .meta-info { padding: 0.875rem 1rem; font-size: 0.875rem; color: var(--color-text-muted); }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
  .stat-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.35rem; font-weight: 700; color: var(--color-primary); }
  .stat-value.positivo, .activo { color: var(--color-success); }
  .stat-value.negativo, .inactivo { color: var(--color-danger); }
  .stat-value.neutro { color: var(--color-text-muted); }
  .resumenes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
  .card { padding: 1rem; }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .comparativa { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem; }
  .comparativa div { display: flex; justify-content: space-between; gap: 1rem; }
  .comparativa span { color: var(--color-text-muted); }
  .filtros-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
  .mes-activo { background: #eef2ff; }
  .link-mes { background: none; border: none; padding: 0; color: var(--color-primary); cursor: pointer; font: inherit; text-align: left; }
  .link-mes:hover { text-decoration: underline; }
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }
</style>
