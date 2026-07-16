<script lang="ts">
  import type { PanelRegla10, PanelVista } from '$lib/types/panel';
  import { formatearMonedaPanel, pctTexto } from '$lib/types/panel';

  interface Props {
    regla: PanelRegla10 | null;
    vista?: PanelVista;
    cargando?: boolean;
  }

  let { regla, vista = 'cobro', cargando = false }: Props = $props();

  let lblConsulting = $derived(vista === 'cobro' ? 'Consulting cobrado en el mes' : 'Consulting pagado en el mes');

  let maxBarra = $derived(
    regla ? Math.max(regla.egresosGrupo, regla.aporteEsperado + regla.gapTechnologies, 1) : 1
  );
</script>

<section class="regla-card card" class:skeleton={cargando}>
  {#if cargando}
    <div class="sk-h"></div>
    <div class="sk-body"></div>
  {:else if regla}
    <header>
      <h2>Regla 10% (vigente desde {regla.fechaVigenciaRegla.slice(0, 7)})</h2>
      {#if !regla.reglaAplica}
        <div class="alerta-vigencia">
          Antes de abril 2026 no aplicaba regla 10%
        </div>
      {/if}
    </header>

    {#if regla.reglaAplica}
      <div class="calculo-grid">
        <div>
          <span class="lbl">{lblConsulting}</span>
          <strong>{formatearMonedaPanel(regla.consultingPagado)}</strong>
        </div>
        <div>
          <span class="lbl">Aporte esperado (10%)</span>
          <strong class="verde">{formatearMonedaPanel(regla.aporteEsperado)}</strong>
        </div>
        <div>
          <span class="lbl">Egresos Grupo del mes</span>
          <strong class="rojo">{formatearMonedaPanel(regla.egresosGrupo)}</strong>
        </div>
        <div>
          <span class="lbl">Cobertura del 10% sobre egresos</span>
          <strong>{pctTexto(regla.coberturaPct)}</strong>
        </div>
        <div class="full">
          <span class="lbl">Gap a cubrir por Technologies</span>
          <strong class="azul">{formatearMonedaPanel(regla.gapTechnologies)}</strong>
        </div>
      </div>

      <div class="chart-barra">
        <div class="barra-total" title="Total egresos Grupo">
          <div
            class="seg verde"
            style="width: {(regla.aporteEsperado / maxBarra) * 100}%"
            title="10% Consulting"
          ></div>
          <div
            class="seg azul"
            style="width: {(regla.gapTechnologies / maxBarra) * 100}%"
            title="Gap Technologies"
          ></div>
        </div>
        <div class="leyenda">
          <span><i class="dot verde"></i>10% Consulting</span>
          <span><i class="dot azul"></i>Gap Technologies</span>
          <span><i class="dot rojo"></i>Egresos Grupo {formatearMonedaPanel(regla.egresosGrupo)}</span>
        </div>
      </div>
    {:else}
      <p class="no-aplica">No aplicable — antes de {regla.fechaVigenciaRegla.slice(0, 7)}</p>
    {/if}
  {/if}
</section>

<style>
  .regla-card {
    padding: 1.5rem;
    background: linear-gradient(135deg, #fafafa 0%, #fff 100%);
    border: 1px solid var(--color-border);
  }

  header h2 {
    font-size: 1.15rem;
    margin-bottom: 0.75rem;
  }

  .alerta-vigencia {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    color: #92400e;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .calculo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .calculo-grid .full { grid-column: 1 / -1; }
  .lbl {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 0.2rem;
  }
  .verde { color: #059669; }
  .azul { color: #2563eb; }
  .rojo { color: #dc2626; }

  .chart-barra { margin-top: 0.5rem; }
  .barra-total {
    display: flex;
    height: 28px;
    border-radius: 8px;
    overflow: hidden;
    background: #fecaca;
    border: 1px solid #f87171;
  }
  .seg { height: 100%; min-width: 2px; }
  .seg.verde { background: #34d399; }
  .seg.azul { background: #60a5fa; }

  .leyenda {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.65rem;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 0.35rem;
    vertical-align: middle;
  }
  .dot.verde { background: #34d399; }
  .dot.azul { background: #60a5fa; }
  .dot.rojo { background: #f87171; }

  .no-aplica {
    color: var(--color-text-muted);
    font-size: 0.95rem;
    padding: 1rem 0;
  }

  .skeleton .sk-h { height: 24px; width: 50%; background: #eee; border-radius: 6px; }
  .skeleton .sk-body { height: 120px; margin-top: 1rem; background: #eee; border-radius: 8px; }
</style>
