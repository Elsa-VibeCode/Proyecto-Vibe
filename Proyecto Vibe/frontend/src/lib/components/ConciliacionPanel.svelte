<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { FiltrosConciliacion, ResumenModulo } from '$lib/types/admin';
  import { filtrosConciliacionVacios } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let error = $state('');
  let cargando = $state(true);
  let filtros = $state<FiltrosConciliacion>(filtrosConciliacionVacios());

  let columnasTabla = $derived(() => {
    if (!resumen?.mapeo) return [];
    const m = resumen.mapeo;
    return [m.fechaMovimiento, m.conceptoMovimiento, m.contraparte, m.cargo, m.abono, m.enFacturas].filter(Boolean) as string[];
  });

  async function cargarDatos() {
    cargando = true;
    error = '';

    const params = new URLSearchParams();
    if (filtros.enFacturas) params.set('enFacturas', filtros.enFacturas);
    const query = params.toString();
    const endpoint = `/excel/ultima/conciliacion${query ? `?${query}` : ''}`;

    try {
      resumen = await api<ResumenModulo>(endpoint);
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
</script>

{#if cargando}
  <p class="estado">Cargando conciliación bancaria...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">
      Importa una hoja como <strong>Conciliación Enero</strong>, <strong>Conciliación Febrero</strong> o
      <strong>Conciliación Marzo</strong> desde <a href="/datos-excel">Datos Excel</a>.
    </p>
  </div>
{:else if resumen?.conciliacion}
  {@const c = resumen.conciliacion}
  <div class="modulo-contenido">
    <div class="meta-info card">
      <p>
        <strong>{resumen.importacion.nombreArchivo}</strong> · {resumen.importacion.nombreHoja}
        {#if c.periodo}· Periodo: {c.periodo}{/if}
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
      <h3>Movimientos bancarios</h3>
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
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }
</style>
