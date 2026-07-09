<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { ResumenModulo } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let error = $state('');
  let cargando = $state(true);

  async function cargarDatos() {
    cargando = true;
    error = '';

    try {
      resumen = await api<ResumenModulo>('/excel/ultima/resumen-mensual');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar finanzas';
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  onMount(() => {
    cargarDatos();
  });

  function valorCelda(valor: unknown): string {
    if (valor === null || valor === undefined || valor === '') return '—';
    const numero = Number(String(valor).replace(/[$,\s]/g, ''));
    if (Number.isFinite(numero) && String(valor).match(/[\d.,]/)) {
      return formatearMoneda(numero);
    }
    return String(valor);
  }

  function esNegativo(valor: unknown): boolean {
    const numero = Number(String(valor).replace(/[$,\s]/g, ''));
    return Number.isFinite(numero) && numero < 0;
  }
</script>

{#if cargando}
  <p class="estado">Cargando resumen financiero...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">
      Importa la hoja <strong>Resumen Mensual</strong> desde
      <a href="/datos-excel">Datos Excel</a>.
    </p>
  </div>
{:else if resumen?.finanzas}
  {@const fin = resumen.finanzas}
  <div class="modulo-contenido">
    <div class="meta-info card">
      <p>
        <strong>{resumen.importacion.nombreArchivo}</strong> · {resumen.importacion.nombreHoja}
      </p>
    </div>

    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">Total ingresos</span>
        <span class="stat-value">{formatearMoneda(fin.totalIngresos)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Neto último mes</span>
        <span class="stat-value" class:negativo={fin.netoUltimoMes < 0}>
          {formatearMoneda(fin.netoUltimoMes)}
        </span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Neto acumulado</span>
        <span class="stat-value" class:negativo={fin.netoAcumulado < 0}>
          {formatearMoneda(fin.netoAcumulado)}
        </span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Conceptos</span>
        <span class="stat-value">{fin.conceptos.length}</span>
      </div>
    </div>

    <section class="card grafica-panel">
      <h3>Ingresos por mes</h3>
      <div class="barras">
        {#each fin.ingresosPorMes as item}
          <div class="barra-item">
            <div class="barra-etiqueta">{item.mes}</div>
            <div class="barra-contenedor">
              <div class="barra-ingresos" style="width: {item.porcentaje}%"></div>
            </div>
            <div class="barra-valores">
              <span>{formatearMoneda(item.ingresos)}</span>
              <span class:negativo={item.neto < 0}>Neto: {formatearMoneda(item.neto)}</span>
            </div>
          </div>
        {/each}
      </div>
    </section>

    {#if fin.egresosPorUnidad && fin.egresosPorUnidad.length > 0}
      <section class="card egresos-unidad-panel">
        <h3>Egresos por unidad de negocio</h3>
        <p class="subtitulo">
          Nómina separada por Consulting y Technologies; el pool de Grupo es el total a cubrir.
          <a href="/nomina">Ver nómina clasificada por pago →</a>
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Concepto</th>
                {#each fin.meses as mes}
                  <th>{mes}</th>
                {/each}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {#each fin.egresosPorUnidad as item}
                <tr class:grupo-pool={item.unidad === 'Grupo'}>
                  <td><strong>{item.unidad}</strong></td>
                  <td>{item.etiqueta}</td>
                  {#each fin.meses as mes}
                    <td>{formatearMoneda(item.porMes[mes] ?? 0)}</td>
                  {/each}
                  <td><strong>{formatearMoneda(item.total)}</strong></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="card tabla-detalle">
      <h3>Resumen mensual por concepto</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Categoría</th>
              {#each fin.meses as mes}
                <th>{mes}</th>
              {/each}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {#each fin.conceptos as fila}
              <tr>
                <td><strong>{String(fila.Concepto ?? '')}</strong></td>
                <td>{String(fila.Categoría ?? '—')}</td>
                {#each fin.meses as mes}
                  <td class:negativo={esNegativo(fila[mes])}>{valorCelda(fila[mes])}</td>
                {/each}
                <td class:negativo={esNegativo(fila[fin.columnaTotal])}>
                  {valorCelda(fila[fin.columnaTotal])}
                </td>
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
  .stat-value.negativo { color: var(--color-danger); }
  .grafica-panel, .tabla-detalle, .egresos-unidad-panel { padding: 1rem; }
  .subtitulo { color: var(--color-text-muted); font-size: 0.82rem; margin: -0.35rem 0 0.75rem; }
  .grupo-pool td { color: var(--color-text-muted); }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .barras { display: flex; flex-direction: column; gap: 0.75rem; }
  .barra-item { display: grid; grid-template-columns: 80px 1fr 200px; gap: 0.75rem; align-items: center; }
  .barra-etiqueta { font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); }
  .barra-contenedor { height: 10px; background: var(--color-border); border-radius: 999px; overflow: hidden; }
  .barra-ingresos { height: 100%; background: var(--color-primary); border-radius: 999px; min-width: 2px; }
  .barra-valores { display: flex; flex-direction: column; font-size: 0.8rem; text-align: right; }
  .negativo { color: var(--color-danger); }
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }

  @media (max-width: 768px) {
    .barra-item { grid-template-columns: 1fr; }
    .barra-valores { text-align: left; }
  }
</style>
