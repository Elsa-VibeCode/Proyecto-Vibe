<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { FiltrosEstadoCuenta, ResumenModulo } from '$lib/types/admin';
  import { filtrosEstadoCuentaVacios } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let error = $state('');
  let cargando = $state(true);
  let filtros = $state<FiltrosEstadoCuenta>(filtrosEstadoCuentaVacios());
  let opcionesUnidad = $state<string[]>([]);

  let esFlujo = $derived(resumen?.tipoHoja === 'estado-cuenta-flujo');

  let columnasTabla = $derived(() => {
    if (!resumen?.mapeo) return [];
    const m = resumen.mapeo;
    if (esFlujo) {
      return [m.fechaMovimiento, m.conceptoMovimiento, m.contraparte, m.unidad, m.cargo, m.abono, m.saldoTotal].filter(Boolean) as string[];
    }
    return [m.fechaMovimiento, m.conceptoMovimiento, m.unidad, m.ingreso, m.egreso, m.saldoTotal].filter(Boolean) as string[];
  });

  async function cargarDatos(cargarOpciones = false) {
    cargando = true;
    error = '';

    const params = new URLSearchParams();
    if (filtros.unidad) params.set('unidad', filtros.unidad);
    const query = params.toString();

    for (const tipo of ['estado-cuenta-flujo', 'estado-cuenta']) {
      try {
        const endpoint = `/excel/ultima/${tipo}${query ? `?${query}` : ''}`;
        const data = await api<ResumenModulo>(endpoint);
        resumen = data;
        if (cargarOpciones && data.estadoCuenta) {
          opcionesUnidad = data.estadoCuenta.porUnidad.map((u) => u.unidad);
        }
        cargando = false;
        return;
      } catch {
        // probar siguiente tipo
      }
    }

    error = 'No hay importaciones de estado de cuenta. Importa la hoja "Estado de Cuenta" o "Estado de Cuenta Flujo" en Datos Excel.';
    resumen = null;
    cargando = false;
  }

  onMount(() => cargarDatos(true));

  function valorCelda(fila: Record<string, unknown>, columna: string): string {
    const valor = fila[columna];
    if (valor === null || valor === undefined || valor === '') return '—';
    const monto = Number(String(valor).replace(/[$,\s]/g, ''));
    if (Number.isFinite(monto) && ['ingreso', 'egreso', 'cargo', 'abono', 'saldo'].some((k) => columna.toLowerCase().includes(k))) {
      return formatearMoneda(monto);
    }
    return String(valor);
  }
</script>

{#if cargando}
  <p class="estado">Cargando estado de cuenta...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">Importa la hoja desde <a href="/datos-excel">Datos Excel</a>.</p>
  </div>
{:else if resumen?.estadoCuenta}
  {@const ec = resumen.estadoCuenta}
  <div class="modulo-contenido">
    <div class="meta-info card">
      <p>
        <strong>{resumen.importacion.nombreArchivo}</strong> · {resumen.importacion.nombreHoja}
        · {esFlujo ? 'Flujo bancario' : 'Por unidad'}
      </p>
      {#if ec.usaMapaSueldos}
        <p class="nota-clasificacion">
          Nómina reclasificada por unidad usando <strong>Sueldos por Unidad</strong>
          {#if ec.nominaReclasificada}
            ({ec.nominaReclasificada} movimientos).
          {/if}
          Solo los gastos operativos de Grupo permanecen en Grupo.
        </p>
      {:else}
        <p class="nota-clasificacion aviso">
          Importa la hoja <strong>Sueldos por Unidad</strong> en Datos Excel para separar nómina de gastos de Grupo.
        </p>
      {/if}
    </div>

    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">{esFlujo ? 'Abonos' : 'Ingresos'}</span>
        <span class="stat-value activo">{formatearMoneda(ec.totalIngresos)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">{esFlujo ? 'Cargos' : 'Egresos'}</span>
        <span class="stat-value inactivo">{formatearMoneda(ec.totalEgresos)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Saldo final</span>
        <span class="stat-value">{formatearMoneda(ec.saldoFinal)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Movimientos</span>
        <span class="stat-value">{ec.movimientos}</span>
      </div>
    </div>

    <section class="card filtros-panel">
      <div class="filtros-grid">
        <div class="form-group">
          <label class="label" for="f-unidad">Unidad</label>
          <select id="f-unidad" class="select" bind:value={filtros.unidad}>
            <option value="">Todas</option>
            {#each opcionesUnidad as unidad}
              <option value={unidad}>{unidad}</option>
            {/each}
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick={() => cargarDatos(false)}>Aplicar filtros</button>
    </section>

    {#if ec.porUnidad.length > 0}
      <section class="card">
        <h3>Por unidad</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Unidad</th><th>Movimientos</th><th>{esFlujo ? 'Abonos' : 'Ingresos'}</th><th>{esFlujo ? 'Cargos' : 'Egresos'}</th></tr>
            </thead>
            <tbody>
              {#each ec.porUnidad as item}
                <tr>
                  <td><strong>{item.unidad}</strong></td>
                  <td>{item.movimientos}</td>
                  <td>{formatearMoneda(item.ingresos)}</td>
                  <td>{formatearMoneda(item.egresos)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="card tabla-detalle">
      <h3>Movimientos</h3>
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
              <tr class:reclasificado={fila._unidadOriginal}>
                {#each columnasTabla() as columna}
                  <td>
                    {valorCelda(fila, columna)}
                    {#if columna === resumen.mapeo?.unidad && fila._unidadOriginal}
                      <span class="badge-reclasificado" title="Antes: {fila._unidadOriginal}">↻</span>
                    {/if}
                  </td>
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
  .nota-clasificacion { margin-top: 0.5rem; font-size: 0.82rem; }
  .nota-clasificacion.aviso { color: var(--color-warning); }
  .reclasificado { background: #f8fafc; }
  .badge-reclasificado { margin-left: 0.25rem; color: var(--color-primary); font-size: 0.75rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
  .stat-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.35rem; font-weight: 700; color: var(--color-primary); }
  .stat-value.activo { color: var(--color-success); }
  .stat-value.inactivo { color: var(--color-danger); }
  .filtros-panel, .card { padding: 1rem; }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .filtros-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }
</style>
