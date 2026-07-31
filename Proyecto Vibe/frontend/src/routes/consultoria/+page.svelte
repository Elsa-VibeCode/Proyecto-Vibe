<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import {
    MESES_ES,
    moneyMx,
    pctLabel,
    labelUbicacion,
    STATUS_LABEL,
    STATUS_PROYECTO_LABEL,
    type ApiResponse,
    type ConsultoriaMeta,
    type ConsultorRef,
    type UbicacionConsultoria,
  } from '$lib/types/consultoria';

  interface DashboardData {
    filtros: { anio: number; mes: number; consultorId: string | null; ubicacion: string | null };
    kpis: {
      ingresoMes: number;
      metaMes: number;
      cumplimientoMes: number | null;
      ingresoAcumulado: number;
      metaAcumulada: number;
      cumplimientoAcumulado: number | null;
      egresosMes: number;
      egresosCantidad: number;
      proyectosActivos: number;
      proyectosPorStatus: Record<string, number>;
      propuestasPipeline: number;
      propuestasPorStatus: Record<string, number>;
      pctGanadas: number | null;
      mesCerrado: boolean;
      conciliacionOk: boolean;
    };
    charts: {
      ingresoVsMeta: { mes: number; ingresoReal: number; meta: number }[];
      egresosPorMes: { mes: number; egresos: number }[];
      comparativoAnual: {
        series: { anio: number; total: number; esHistorico: boolean }[];
      };
      distribucionProyectos: { nombre: string; total: number; pct: number }[];
      ganadasPorConsultor: { nombre: string; total: number; pct: number }[];
      pipelinePorStatus: Record<string, number>;
      proyectosPorStatus: Record<string, number>;
    };
    formulas: Record<string, string>;
    enlaces: Record<string, string>;
    consultores: ConsultorRef[];
  }

  let puedeEditar = $derived(
    $auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor'
  );

  let meta = $state<ConsultoriaMeta | null>(null);
  let dash = $state<DashboardData | null>(null);
  let anio = $state(new Date().getFullYear());
  let mes = $state(new Date().getMonth() + 1);
  let consultorId = $state('');
  let ubicacion = $state('');
  let cargando = $state(false);
  let error = $state('');

  const COLORS = ['#1d4ed8', '#059669', '#ea580c', '#7c3aed', '#db2777', '#0891b2', '#ca8a04'];

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const p = new URLSearchParams({ anio: String(anio), mes: String(mes) });
      if (consultorId) p.set('consultorId', consultorId);
      if (ubicacion) p.set('ubicacion', ubicacion);
      const [m, d] = await Promise.all([
        api<ApiResponse<ConsultoriaMeta>>('/consultoria/meta'),
        api<ApiResponse<DashboardData>>(`/consultoria/dashboard?${p}`),
      ]);
      meta = m.data;
      dash = d.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar dashboard';
      dash = null;
    } finally {
      cargando = false;
    }
  }

  function maxVal(nums: number[]) {
    return Math.max(...nums, 1);
  }

  function donutBg(items: { pct: number }[]) {
    if (!items.length) return '#e2e8f0';
    let acc = 0;
    const parts: string[] = [];
    items.forEach((it, i) => {
      const start = acc * 100;
      acc += it.pct;
      const end = acc * 100;
      parts.push(`${COLORS[i % COLORS.length]} ${start}% ${end}%`);
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  onMount(() => {
    if (puedeEditar) cargar();
  });
</script>

<svelte:head>
  <title>Consultoría — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Consultoría (BWConsulting)</h1>
      <p>Dashboard operativo — precisión auditable, montos sin IVA</p>
    </div>
    <div class="header-actions">
      <a href="/consultoria/propuestas" class="btn btn-secondary">Propuestas</a>
      <a href="/consultoria/proyectos" class="btn btn-secondary">Proyectos</a>
      <a href="/consultoria/ingresos" class="btn btn-primary">Ingresos</a>
    </div>
  </header>

  {#if !puedeEditar}
    <p class="estado">Requiere rol admin o editor.</p>
  {:else}
    {#if error}<div class="alert alert-error">{error}</div>{/if}

    <section class="card filtros">
      <div class="form-group">
        <label class="label" for="anio">Año</label>
        <input id="anio" class="input" type="number" bind:value={anio} min="2020" />
      </div>
      <div class="form-group">
        <label class="label" for="mes">Mes</label>
        <select id="mes" class="select" bind:value={mes}>
          {#each MESES_ES.slice(1) as nombre, i}
            <option value={i + 1}>{nombre}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="cons">Consultor</label>
        <select id="cons" class="select" bind:value={consultorId}>
          <option value="">Todos</option>
          {#each dash?.consultores ?? [] as c}
            <option value={c._id}>{c.nombre}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="ubi">Ubicación</label>
        <select id="ubi" class="select" bind:value={ubicacion}>
          <option value="">Todas</option>
          {#each meta?.enums.ubicaciones ?? [] as u}
            <option value={u}>{labelUbicacion(u)}</option>
          {/each}
        </select>
      </div>
      <button type="button" class="btn btn-secondary" onclick={cargar}>Actualizar</button>
    </section>

    {#if cargando && !dash}
      <p class="estado">Cargando…</p>
    {:else if dash}
      {@const k = dash.kpis}
      {@const c = dash.charts}
      {@const maxLinea = maxVal(c.ingresoVsMeta.flatMap((x) => [x.ingresoReal, x.meta]))}
      {@const maxComp = maxVal(c.comparativoAnual.series.map((s) => s.total))}
      {@const maxEg = maxVal(c.egresosPorMes.map((x) => x.egresos))}

      <section class="kpi-grid">
        <article class="kpi-card verde" title={dash.formulas.cumplimientoMes}>
          <h3>Ingreso del mes</h3>
          <div class="big">{moneyMx(k.ingresoMes)}</div>
          <p class="sub">Meta {moneyMx(k.metaMes)} · {pctLabel(k.cumplimientoMes)}</p>
          <div class="bar"><div class="fill" style="width: {Math.min(100, (k.cumplimientoMes || 0) * 100)}%"></div></div>
          <a href={dash.enlaces.ingresos}>Ver ingresos →</a>
        </article>
        <article class="kpi-card azul" title={dash.formulas.cumplimientoAcumulado}>
          <h3>Acumulado año</h3>
          <div class="big">{moneyMx(k.ingresoAcumulado)}</div>
          <p class="sub">Meta {moneyMx(k.metaAcumulada)} · {pctLabel(k.cumplimientoAcumulado)}</p>
          <div class="bar"><div class="fill" style="width: {Math.min(100, (k.cumplimientoAcumulado || 0) * 100)}%"></div></div>
        </article>
        <article class="kpi-card naranja" title={dash.formulas.egresosMes}>
          <h3>Egresos del mes</h3>
          <div class="big">{moneyMx(k.egresosMes)}</div>
          <p class="sub">{k.egresosCantidad} movimientos · unidad Consulting</p>
          <a href={dash.enlaces.egresos}>Abrir egresos →</a>
        </article>
        <article class="kpi-card">
          <h3>Proyectos activos</h3>
          <div class="big">{k.proyectosActivos}</div>
          <p class="sub">
            {#each Object.entries(k.proyectosPorStatus || {}) as [st, n]}
              <span class="chip">{STATUS_PROYECTO_LABEL[st as keyof typeof STATUS_PROYECTO_LABEL] ?? st}: {n}</span>
            {/each}
          </p>
          <a href={dash.enlaces.proyectos}>Ver proyectos →</a>
        </article>
        <article class="kpi-card">
          <h3>Pipeline propuestas</h3>
          <div class="big">{k.propuestasPipeline}</div>
          <p class="sub">Ganadas {pctLabel(k.pctGanadas)}</p>
          <p class="sub">
            {#each Object.entries(k.propuestasPorStatus || {}) as [st, n]}
              <span class="chip">{STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st}: {n}</span>
            {/each}
          </p>
          <a href={dash.enlaces.propuestas}>Ver propuestas →</a>
        </article>
        <article class="kpi-card" class:warn={!k.conciliacionOk}>
          <h3>Estado del mes</h3>
          <div class="big">{k.mesCerrado ? 'Cerrado' : 'Abierto'}</div>
          <p class="sub">{k.conciliacionOk ? 'Conciliación OK' : 'Hay descuadre en ingresos'}</p>
        </article>
      </section>

      <section class="charts-grid">
        <div class="card chart">
          <h2 title="ingreso_real vs meta por mes">Ingreso real vs meta ({anio})</h2>
          <div class="barras">
            {#each c.ingresoVsMeta as item}
              <div class="col" title="{MESES_ES[item.mes]}: real {moneyMx(item.ingresoReal)} / meta {moneyMx(item.meta)}">
                <div class="bar-wrap">
                  <div class="duo">
                    <div class="b meta" style="height: {(item.meta / maxLinea) * 100}%"></div>
                    <div class="b real" style="height: {(item.ingresoReal / maxLinea) * 100}%"></div>
                  </div>
                </div>
                <span class="lab">{String(item.mes).padStart(2, '0')}</span>
              </div>
            {/each}
          </div>
          <div class="leyenda">
            <span><i class="swatch meta"></i>Meta</span>
            <span><i class="swatch real"></i>Ingreso real</span>
          </div>
        </div>

        <div class="card chart">
          <h2>Comparativo anual</h2>
          <div class="barras barras-h">
            {#each c.comparativoAnual.series as s}
              <div class="row-bar" title="{s.anio}: {moneyMx(s.total)}">
                <span class="ylab">{s.anio}</span>
                <div class="track">
                  <div class="fill-h" style="width: {(s.total / maxComp) * 100}%"></div>
                </div>
                <span class="val">{moneyMx(s.total)}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="card chart">
          <h2 title={dash.formulas.egresosMes}>Egresos Consulting por mes</h2>
          <div class="barras">
            {#each c.egresosPorMes as item}
              <div class="col" title="{MESES_ES[item.mes]}: {moneyMx(item.egresos)}">
                <div class="bar-wrap">
                  <div class="b egreso" style="height: {(item.egresos / maxEg) * 100}%"></div>
                </div>
                <span class="lab">{String(item.mes).padStart(2, '0')}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="card chart donut-card">
          <h2>Proyectos por consultor</h2>
          <div class="donut-wrap">
            <div
              class="donut"
              style="background: {donutBg(c.distribucionProyectos)}"
              title="Distribución de proyectos activos"
            ></div>
            <ul class="donut-list">
              {#each c.distribucionProyectos as d, i}
                <li>
                  <i class="dot" style="background: {COLORS[i % COLORS.length]}"></i>
                  {d.nombre}
                  <strong>{d.total}</strong>
                  <span class="muted">{pctLabel(d.pct)}</span>
                </li>
              {:else}
                <li class="muted">Sin proyectos activos</li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="card chart donut-card">
          <h2 title={dash.formulas.ganadasPct}>Propuestas ganadas por líder ({anio})</h2>
          <div class="donut-wrap">
            <div class="donut" style="background: {donutBg(c.ganadasPorConsultor)}"></div>
            <ul class="donut-list">
              {#each c.ganadasPorConsultor as d, i}
                <li>
                  <i class="dot" style="background: {COLORS[i % COLORS.length]}"></i>
                  {d.nombre}
                  <strong>{d.total}</strong>
                  <span class="muted">{pctLabel(d.pct)}</span>
                </li>
              {:else}
                <li class="muted">Sin ganadas en el filtro</li>
              {/each}
            </ul>
          </div>
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .page {
    padding: 1.5rem;
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .card.filtros {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.85rem;
    margin-bottom: 1rem;
  }
  .kpi-card {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 1rem;
    border-top: 4px solid #64748b;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .kpi-card.verde {
    border-top-color: #059669;
  }
  .kpi-card.azul {
    border-top-color: #2563eb;
  }
  .kpi-card.naranja {
    border-top-color: #ea580c;
  }
  .kpi-card.warn {
    border-top-color: #b45309;
    background: #fffbeb;
  }
  .kpi-card h3 {
    margin: 0;
    font-size: 0.9rem;
    color: #475569;
  }
  .big {
    font-size: 1.45rem;
    font-weight: 800;
  }
  .sub {
    margin: 0;
    font-size: 0.8rem;
    color: #64748b;
  }
  .bar {
    height: 6px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: #059669;
  }
  .kpi-card a {
    margin-top: auto;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1d4ed8;
    text-decoration: none;
  }
  .chip {
    display: inline-block;
    font-size: 0.7rem;
    background: #f1f5f9;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    margin: 0.1rem 0.15rem 0 0;
  }
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }
  .chart {
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }
  .chart h2 {
    font-size: 0.95rem;
    margin: 0 0 0.75rem;
  }
  .barras {
    display: flex;
    gap: 0.35rem;
    align-items: flex-end;
    min-height: 160px;
  }
  .col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .bar-wrap {
    width: 100%;
    height: 140px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .duo {
    display: flex;
    gap: 2px;
    align-items: flex-end;
    height: 100%;
    width: 90%;
  }
  .b {
    flex: 1;
    min-height: 2px;
    border-radius: 3px 3px 0 0;
  }
  .b.meta {
    background: #cbd5e1;
  }
  .b.real {
    background: #059669;
  }
  .b.egreso {
    width: 70%;
    background: #ea580c;
    margin: 0 auto;
  }
  .lab {
    font-size: 0.65rem;
    color: #64748b;
  }
  .leyenda {
    display: flex;
    gap: 1rem;
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: #64748b;
  }
  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 0.25rem;
  }
  .swatch.meta {
    background: #cbd5e1;
  }
  .swatch.real {
    background: #059669;
  }
  .barras-h {
    flex-direction: column;
    align-items: stretch;
    min-height: auto;
    gap: 0.5rem;
  }
  .row-bar {
    display: grid;
    grid-template-columns: 3rem 1fr auto;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.8rem;
  }
  .track {
    height: 14px;
    background: #f1f5f9;
    border-radius: 999px;
    overflow: hidden;
  }
  .fill-h {
    height: 100%;
    background: #2563eb;
    border-radius: 999px;
  }
  .val {
    font-variant-numeric: tabular-nums;
    font-size: 0.75rem;
  }
  .donut-wrap {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .donut {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .donut-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.85rem;
    flex: 1;
  }
  .donut-list li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .muted {
    color: #64748b;
    font-size: 0.8rem;
  }
  .estado {
    color: #64748b;
  }
</style>
