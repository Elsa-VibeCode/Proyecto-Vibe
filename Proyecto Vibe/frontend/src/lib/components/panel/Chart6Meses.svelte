<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import type { PanelChartMes } from '$lib/types/panel';
  import { etiquetaMes, formatearMonedaPanel } from '$lib/types/panel';

  interface Props {
    datos: PanelChartMes[];
    cargando?: boolean;
    chartAnual?: PanelChartMes[];
  }

  let { datos, cargando = false, chartAnual = [] }: Props = $props();

  let modalAnual = $state(false);

  let maxTotal = $derived(
    Math.max(
      ...datos.map(
        (d) => d.consultingIngreso + d.techBBVA + d.techFuera + d.egresosTotal
      ),
      1
    )
  );
</script>

<section class="chart-section card">
  <div class="chart-header">
    <h2>Últimos 6 meses</h2>
    {#if chartAnual.length > 0}
      <button type="button" class="btn btn-secondary btn-sm" onclick={() => (modalAnual = true)}>
        Ver año completo
      </button>
    {/if}
  </div>

  {#if cargando}
    <div class="sk-chart"></div>
  {:else}
    <div class="chart-scroll">
      <div class="barras">
        {#each datos as item}
          {@const ingresoTotal = item.consultingIngreso + item.techBBVA + item.techFuera}
          {@const alturaMax = Math.max(ingresoTotal, item.egresosTotal, 1)}
          <div class="col" title="Consulting: {formatearMonedaPanel(item.consultingIngreso)} · Tech BBVA: {formatearMonedaPanel(item.techBBVA)} · Tech fuera: {formatearMonedaPanel(item.techFuera)} · Egresos: {formatearMonedaPanel(item.egresosTotal)}">
            <div class="bar-wrap">
              <div
                class="stack ingresos"
                style="height: {(ingresoTotal / maxTotal) * 100}%"
              >
                <div
                  class="seg consulting"
                  style="flex: {item.consultingIngreso}"
                ></div>
                <div class="seg tech-bbva" style="flex: {item.techBBVA}"></div>
                <div class="seg tech-fuera" style="flex: {item.techFuera || 0.001}"></div>
              </div>
              <div
                class="linea-egresos"
                style="bottom: {(item.egresosTotal / maxTotal) * 100}%"
                title="Egresos {formatearMonedaPanel(item.egresosTotal)}"
              ></div>
            </div>
            <span class="mes">{etiquetaMes(item.mes)}</span>
          </div>
        {/each}
      </div>
    </div>
    <div class="leyenda">
      <span><i class="c consulting"></i>Consulting</span>
      <span><i class="c tech-bbva"></i>Tech BBVA</span>
      <span><i class="c tech-fuera"></i>Tech fuera BBVA</span>
      <span><i class="line"></i>Egresos</span>
    </div>
  {/if}
</section>

<Modal abierto={modalAnual} titulo="Ingresos vs egresos — 12 meses" onCerrar={() => (modalAnual = false)}>
  <div class="chart-scroll modal-chart">
    <div class="barras barras-anual">
      {#each chartAnual as item}
        {@const ingresoTotal = item.consultingIngreso + item.techBBVA + item.techFuera}
        <div class="col col-sm" title="{etiquetaMes(item.mes)}: {formatearMonedaPanel(ingresoTotal)} ingresos · {formatearMonedaPanel(item.egresosTotal)} egresos">
          <div class="bar-wrap bar-sm">
            <div class="stack ingresos" style="height: {(ingresoTotal / maxTotal) * 100}%">
              <div class="seg consulting" style="flex: {item.consultingIngreso}"></div>
              <div class="seg tech-bbva" style="flex: {item.techBBVA}"></div>
              <div class="seg tech-fuera" style="flex: {item.techFuera || 0.001}"></div>
            </div>
          </div>
          <span class="mes mes-sm">{item.mes.slice(5)}</span>
        </div>
      {/each}
    </div>
  </div>
</Modal>

<style>
  .chart-section { padding: 1.25rem; }
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 0.5rem;
  }
  h2 { font-size: 1.05rem; }
  .btn-sm { font-size: 0.8rem; padding: 0.35rem 0.75rem; }

  .chart-scroll {
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .barras {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    min-height: 220px;
    min-width: min(100%, 640px);
  }

  .barras-anual { min-width: 720px; }

  .col {
    flex: 1;
    min-width: 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }
  .col-sm { min-width: 48px; }

  .bar-wrap {
    position: relative;
    width: 100%;
    height: 180px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .bar-sm { height: 140px; }

  .stack {
    width: 70%;
    display: flex;
    flex-direction: column-reverse;
    border-radius: 6px 6px 0 0;
    overflow: hidden;
    min-height: 4px;
  }
  .seg { min-height: 2px; }
  .consulting { background: #6ee7b7; }
  .tech-bbva { background: #93c5fd; }
  .tech-fuera { background: #1d4ed8; }

  .linea-egresos {
    position: absolute;
    left: 5%;
    right: 5%;
    height: 3px;
    background: #ef4444;
    border-radius: 2px;
    pointer-events: none;
  }

  .mes {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-align: center;
  }
  .mes-sm { font-size: 0.65rem; }

  .leyenda {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 1rem;
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }
  .c, .line {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    margin-right: 0.3rem;
    vertical-align: middle;
  }
  .line { background: #ef4444; height: 3px; width: 16px; border-radius: 2px; }

  .sk-chart {
    height: 220px;
    background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    border-radius: 8px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .modal-chart { max-height: 50vh; }
</style>
