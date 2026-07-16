<script lang="ts">
  import { formatearMonedaPanel, pctTexto, textoDelta, deltaEsPositivo } from '$lib/types/panel';

  interface Props {
    titulo: string;
    color: 'verde' | 'azul' | 'naranja';
    kpi: number;
    kpiTooltip?: string;
    submetricas: { icono: string; label: string; valor: string; detalle?: string }[];
    pctProgreso?: number;
    enlace?: string;
    enlaceTexto?: string;
    delta?: number | null;
    deltaEsGasto?: boolean;
    cargando?: boolean;
  }

  let {
    titulo,
    color,
    kpi,
    kpiTooltip = '',
    submetricas,
    pctProgreso,
    enlace = '',
    enlaceTexto = 'Ver detalle →',
    delta = null,
    deltaEsGasto = false,
    cargando = false,
  }: Props = $props();

  let deltaTexto = $derived(textoDelta(delta, deltaEsGasto));
  let deltaBueno = $derived(deltaEsPositivo(delta, deltaEsGasto));
</script>

<article class="kpi-card card color-{color}" class:skeleton={cargando}>
  {#if cargando}
    <div class="sk-title"></div>
    <div class="sk-kpi"></div>
    <div class="sk-lines">
      <div></div><div></div><div></div>
    </div>
  {:else}
    <header>
      <h3>{titulo}</h3>
    </header>

    {#if enlace}
      <a class="kpi-principal kpi-link" href={enlace} title={kpiTooltip}>
        {formatearMonedaPanel(kpi)}
      </a>
    {:else}
      <div class="kpi-principal" title={kpiTooltip}>
        {formatearMonedaPanel(kpi)}
      </div>
    {/if}

    {#if deltaTexto}
      <p class="delta-line" class:good={deltaBueno} class:bad={!deltaBueno}>{deltaTexto}</p>
    {/if}

    <ul class="submetricas">
      {#each submetricas as s}
        <li>
          <span class="icono">{s.icono}</span>
          <span class="label">{s.label}</span>
          <span class="valor">{s.valor}</span>
          {#if s.detalle}
            <span class="detalle">{s.detalle}</span>
          {/if}
        </li>
      {/each}
    </ul>

    {#if pctProgreso !== undefined}
      <div class="progreso-wrap">
        <div class="progreso-bar">
          <div class="progreso-fill" style="width: {Math.min(100, pctProgreso * 100)}%"></div>
        </div>
        <span class="progreso-label">{pctTexto(pctProgreso)} pagado</span>
      </div>
    {/if}

    {#if enlace}
      <a class="enlace" href={enlace}>{enlaceTexto}</a>
    {/if}
  {/if}
</article>

<style>
  .kpi-card {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    border-top: 4px solid var(--accent);
    min-height: 280px;
  }

  .color-verde { --accent: #059669; }
  .color-azul { --accent: #2563eb; }
  .color-naranja { --accent: #ea580c; }

  header h3 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
  }

  .kpi-principal {
    font-size: 1.85rem;
    font-weight: 800;
    line-height: 1.1;
    cursor: help;
  }

  .kpi-link {
    display: block;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .kpi-link:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .delta-line {
    font-size: 0.78rem;
    font-weight: 600;
    margin: -0.25rem 0 0;
  }
  .delta-line.good { color: #047857; }
  .delta-line.bad { color: #b91c1c; }

  .submetricas {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    font-size: 0.85rem;
  }

  .submetricas li {
    display: grid;
    grid-template-columns: 1.25rem 1fr auto;
    gap: 0.35rem;
    align-items: baseline;
  }

  .detalle {
    grid-column: 2 / -1;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .valor { font-weight: 600; text-align: right; }

  .progreso-wrap { margin-top: auto; }
  .progreso-bar {
    height: 8px;
    background: var(--color-border);
    border-radius: 999px;
    overflow: hidden;
  }
  .progreso-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
  }
  .progreso-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
    display: block;
  }

  .enlace {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
    margin-top: 0.25rem;
  }
  .enlace:hover { text-decoration: underline; }

  .skeleton .sk-title, .skeleton .sk-kpi, .skeleton .sk-lines div {
    background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    border-radius: 6px;
  }
  .sk-title { height: 18px; width: 40%; }
  .sk-kpi { height: 36px; width: 70%; }
  .sk-lines { display: flex; flex-direction: column; gap: 8px; margin-top: 1rem; }
  .sk-lines div { height: 14px; width: 100%; }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
