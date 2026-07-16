<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMonedaPanel, pctTexto } from '$lib/types/panel';
  import KpiCard from '$lib/components/panel/KpiCard.svelte';
  import Regla10Card from '$lib/components/panel/Regla10Card.svelte';
  import AlertasList from '$lib/components/panel/AlertasList.svelte';
  import Chart6Meses from '$lib/components/panel/Chart6Meses.svelte';
  import MesSelector from '$lib/components/panel/MesSelector.svelte';
  import SaldosTable from '$lib/components/panel/SaldosTable.svelte';
  import type { PanelData } from '$lib/types/panel';

  let mesActivo = $state('');
  let comparar = $state(false);
  let panel = $state<PanelData | null>(null);
  let cargando = $state(true);
  let error = $state('');
  let saldosYtd = $state(false);
  let refrescando = $state(false);

  const mesActual = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })
  );
  const mesDefault = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}`;

  let opcionesMes = $derived.by(() => {
    const opts: string[] = [];
    let [y, m] = mesDefault.split('-').map(Number);
    for (let i = 0; i < 24; i += 1) {
      opts.push(`${y}-${String(m).padStart(2, '0')}`);
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
    }
    return opts;
  });

  async function cargarPanel(refrescar = false) {
    if (!mesActivo) mesActivo = mesDefault;
    cargando = !panel;
    refrescando = refrescar;
    error = '';

    try {
      const qs = refrescar ? '&refrescar=1' : '';
      const data = await api<{ data: PanelData }>(`/panel?mes=${mesActivo}${qs}`);
      panel = data.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar el panel';
      panel = null;
    } finally {
      cargando = false;
      refrescando = false;
    }
  }

  onMount(() => {
    mesActivo = mesDefault;
    cargarPanel();
  });

  function onMesChange() {
    cargarPanel();
  }

  function onCompararChange() {
    /* deltas vienen en el payload del panel; solo re-render */
  }

</script>

<div class="panel-home">
  <header class="panel-header">
    <div>
      <h1>Panel</h1>
      <p>KPIs en tiempo real por unidad de negocio</p>
    </div>
    <div class="controles">
      <MesSelector bind:mesActivo={mesActivo} {opcionesMes} disabled={cargando && !panel} onchange={onMesChange} />

      <label class="toggle-comp">
        <input type="checkbox" bind:checked={comparar} onchange={onCompararChange} />
        Comparar con mes anterior
      </label>

      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onclick={() => cargarPanel(true)}
        disabled={refrescando}
      >
        {refrescando ? '…' : '↻ Refrescar'}
      </button>

      <a class="link-config" href="/config">⚙ Config</a>
      <a class="link-config" href="/config/egresos-recurrentes">📋 Recurrentes</a>

      {#if panel}
        <span class="actualizado" title={panel.desdeCache ? 'Desde caché (60s)' : 'Recién calculado'}>
          Actualizado: {panel.actualizadoEn}
        </span>
      {/if}
    </div>
  </header>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if panel?.sinDatos && !cargando}
    <div class="sin-datos card">
      <p>Sin datos para este mes.</p>
      <a href="/datos-excel" class="btn btn-primary">Importar histórico (Datos Excel)</a>
    </div>
  {/if}

  <div class="kpi-grid">
    <KpiCard
      titulo="Consulting"
      color="verde"
      kpi={panel?.unidades.consulting.facturado ?? 0}
      kpiTooltip="Total facturado en el mes activo (mes de facturación)"
      submetricas={panel
        ? [
            {
              icono: '✓',
              label: 'Pagado',
              valor: formatearMonedaPanel(panel.unidades.consulting.pagado),
              detalle: `${panel.unidades.consulting.numPagadas} facturas`,
            },
            {
              icono: '⏳',
              label: 'Pendiente',
              valor: formatearMonedaPanel(panel.unidades.consulting.pendiente),
              detalle: `${panel.unidades.consulting.numPendientes} facturas`,
            },
            {
              icono: '📤',
              label: 'Aporte 10% al Grupo',
              valor: formatearMonedaPanel(panel.unidades.consulting.aporte10pct),
              detalle: 'Sobre pagado en el mes',
            },
          ]
        : []}
      pctProgreso={panel?.unidades.consulting.pctPagado}
      enlace={`/facturacion?mesFacturacion=${mesActivo}`}
      enlaceTexto="Ver facturas del mes →"
      delta={comparar ? (panel?.unidades.consulting.deltaFacturadoMesAnterior ?? null) : null}
      cargando={cargando && !panel}
    />

    <KpiCard
      titulo="Technologies"
      color="azul"
      kpi={panel?.unidades.technologies.facturado ?? 0}
      kpiTooltip="Total facturado Technologies (BBVA + fuera BBVA)"
      submetricas={panel
        ? [
            {
              icono: '✓',
              label: 'Pagado',
              valor: formatearMonedaPanel(panel.unidades.technologies.pagado),
              detalle: panel.unidades.technologies.numPagadas != null
                ? `${panel.unidades.technologies.numPagadas} facturas`
                : undefined,
            },
            {
              icono: '⏳',
              label: 'Pendiente',
              valor: formatearMonedaPanel(panel.unidades.technologies.pendiente),
              detalle: panel.unidades.technologies.numPendientes != null
                ? `${panel.unidades.technologies.numPendientes} facturas`
                : undefined,
            },
            {
              icono: '💰',
              label: 'Reserva acumulada',
              valor: formatearMonedaPanel(panel.unidades.technologies.reservaAcumulada),
            },
            {
              icono: '📥',
              label: 'Recibe de Consulting (10%)',
              valor: formatearMonedaPanel(panel.unidades.technologies.recibe10pct),
            },
          ]
        : []}
      enlace="/flujo"
      enlaceTexto="Ver flujo Technologies →"
      delta={comparar ? (panel?.unidades.technologies.deltaFacturadoMesAnterior ?? null) : null}
      cargando={cargando && !panel}
    />

    <KpiCard
      titulo="Grupo (gastos compartidos)"
      color="naranja"
      kpi={panel?.unidades.grupo.egresosTotal ?? 0}
      kpiTooltip="Total egresos del mes con unidad Grupo"
      submetricas={panel
        ? [
            {
              icono: '📥',
              label: 'Recibió 10% Consulting',
              valor: formatearMonedaPanel(panel.unidades.grupo.recibio10pct),
            },
            {
              icono: '❌',
              label: 'Déficit del mes',
              valor: formatearMonedaPanel(panel.unidades.grupo.deficitMes),
            },
            {
              icono: '📊',
              label: 'Cubierto por',
              valor: `${pctTexto(panel.unidades.grupo.cobertura.consulting)} Cons. / ${pctTexto(panel.unidades.grupo.cobertura.technologies)} Tech.`,
            },
          ]
        : []}
      enlace={`/egresos?mes=${mesActivo}`}
      enlaceTexto="Ver egresos del mes →"
      delta={comparar ? (panel?.unidades.grupo.deltaEgresosMesAnterior ?? null) : null}
      deltaEsGasto={true}
      cargando={cargando && !panel}
    />
  </div>

  <Regla10Card regla={panel?.regla10 ?? null} cargando={cargando && !panel} />

  <AlertasList alertas={panel?.alertas ?? []} cargando={cargando && !panel} />

  <Chart6Meses
    datos={panel?.chart6meses ?? []}
    chartAnual={panel?.chart12meses ?? []}
    cargando={cargando && !panel}
  />

  <SaldosTable
    saldos={saldosYtd ? (panel?.saldosYtd ?? []) : (panel?.saldos ?? [])}
    ytd={saldosYtd}
    onToggleYtd={(v) => (saldosYtd = v)}
    cargando={cargando && !panel}
  />
</div>

<style>
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .panel-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
  }

  .panel-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .controles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .toggle-comp {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .btn-sm {
    font-size: 0.85rem;
    padding: 0.4rem 0.75rem;
  }

  .link-config {
    font-size: 0.85rem;
    color: var(--color-primary);
    text-decoration: none;
  }
  .link-config:hover { text-decoration: underline; }

  .actualizado {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 1024px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 640px) {
    .kpi-grid { grid-template-columns: 1fr; }
  }

  .sin-datos {
    padding: 1.25rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  :global(.panel-home > *) {
    margin-bottom: 1rem;
  }
</style>
