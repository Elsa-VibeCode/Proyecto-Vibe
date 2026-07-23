<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api, apiDescargar } from '$lib/api';
  import {
    money,
    type ApiResponse,
    type ReporteMensual,
  } from '$lib/types/honorarios';

  let puedeAdmin = $derived($auth.usuario?.rol === 'admin');
  let periodo = $state(new Date().toISOString().slice(0, 7));
  let reporte = $state<ReporteMensual | null>(null);
  let cargando = $state(false);
  let error = $state('');

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const res = await api<ApiResponse<ReporteMensual>>(
        `/honorarios/reports/monthly/${periodo}`
      );
      reporte = res.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar';
      reporte = null;
    } finally {
      cargando = false;
    }
  }

  async function exportar() {
    try {
      await apiDescargar(
        `/honorarios/exports/monthly/${periodo}.xlsx`,
        `honorarios-${periodo}.xlsx`
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al exportar';
    }
  }

  onMount(() => {
    if (puedeAdmin) cargar();
  });
</script>

<svelte:head>
  <title>Honorarios consolidado — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Honorarios Consulting</h1>
      <p>Vista mensual consolidada (tipo Distribución Excel)</p>
    </div>
    <div class="header-actions">
      <a href="/honorarios/captura" class="btn btn-primary">+ Captura</a>
      <a href="/honorarios/reportes" class="btn btn-secondary">Reportes</a>
    </div>
  </header>

  {#if !puedeAdmin}
    <p class="estado">Solo administradores pueden usar este módulo.</p>
  {:else}
    <section class="card filtros">
      <div class="form-group">
        <label class="label" for="hm-mes">Mes</label>
        <input id="hm-mes" class="input" type="month" bind:value={periodo} />
      </div>
      <button type="button" class="btn btn-secondary" onclick={cargar}>Buscar</button>
      <button type="button" class="btn btn-secondary" onclick={exportar} disabled={!reporte}
        >Exportar Excel</button
      >
    </section>

    {#if error}<div class="alert alert-error">{error}</div>{/if}
    {#if cargando}
      <p class="estado">Cargando…</p>
    {:else if reporte && reporte.filas.length === 0}
      <p class="estado">
        No hay distribuciones para {periodo}. Usa <a href="/honorarios/captura">Captura</a> para
        registrar.
      </p>
    {:else if reporte}
      <div class="table-wrap">
        <table class="tabla">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>1A Qna</th>
              <th>2da Qna</th>
              <th>TECH</th>
              <th>LICENCIA</th>
              <th>Neto</th>
              {#each reporte.consultores as c}
                <th colspan="2">{c.nombre}</th>
              {/each}
              <th></th>
            </tr>
            <tr class="subhead">
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              {#each reporte.consultores as _}
                <th>Total</th>
                <th>Q1 / Q2</th>
              {/each}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each reporte.filas as f}
              <tr>
                <td>
                  {f.proyecto}
                  {#if f.advertenciaPct}<span class="badge-warn" title={f.advertenciaPct}>⚠</span>{/if}
                </td>
                <td class="num">{money(f.ingreso1aQna)}</td>
                <td class="num">{money(f.ingreso2daQna)}</td>
                <td class="num">{money(f.montoTech)}</td>
                <td class="num">{money(f.montoLicencia)}</td>
                <td class="num">{money(f.netoDistribuible)}</td>
                {#each reporte.consultores as c}
                  {@const v = f.porConsultor[c._id]}
                  <td class="num">{money(v?.total ?? 0)}</td>
                  <td class="num muted"
                    >{money(v?.q1 ?? 0)} / {money(v?.q2 ?? 0)}</td
                  >
                {/each}
                <td class="acciones">
                  <a
                    class="link-edit"
                    href={`/honorarios/captura?projectId=${f.projectId}&periodo=${periodo}`}
                    >Editar</a
                  >
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>TOTAL</strong></td>
              <td class="num"><strong>{money(reporte.totales.ingreso1aQna)}</strong></td>
              <td class="num"><strong>{money(reporte.totales.ingreso2daQna)}</strong></td>
              <td class="num"><strong>{money(reporte.totales.montoTech)}</strong></td>
              <td class="num"><strong>{money(reporte.totales.montoLicencia)}</strong></td>
              <td class="num"><strong>{money(reporte.totales.netoDistribuible)}</strong></td>
              {#each reporte.consultores as c}
                {@const v = reporte.totales.porConsultor[c._id]}
                <td class="num"><strong>{money(v?.total ?? 0)}</strong></td>
                <td class="num muted"
                  >{money(v?.q1 ?? 0)} / {money(v?.q2 ?? 0)}</td
                >
              {/each}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
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
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
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
  .table-wrap {
    overflow-x: auto;
  }
  .tabla {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .tabla th,
  .tabla td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }
  .subhead th {
    font-weight: 500;
    color: #64748b;
    font-size: 0.75rem;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: #64748b;
    font-size: 0.75rem;
  }
  .badge-warn {
    color: #b45309;
    margin-left: 0.25rem;
  }
  .acciones {
    text-align: center;
  }
  .link-edit {
    color: #1d4ed8;
    font-weight: 500;
    text-decoration: none;
  }
  .link-edit:hover {
    text-decoration: underline;
  }
  tfoot td {
    border-top: 2px solid #94a3b8;
  }
</style>
