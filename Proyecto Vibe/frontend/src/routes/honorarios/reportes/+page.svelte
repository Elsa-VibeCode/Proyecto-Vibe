<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import {
    money,
    pctLabel,
    type ApiResponse,
    type Consultant,
    type ReporteConsultor,
    type ReporteIngresos,
  } from '$lib/types/honorarios';

  let puedeAdmin = $derived($auth.usuario?.rol === 'admin');
  let consultores = $state<Consultant[]>([]);
  let consultantId = $state('');
  let desde = $state('2026-01');
  let hasta = $state(new Date().toISOString().slice(0, 7));
  let tab = $state<'consultor' | 'ingresos'>('consultor');
  let repConsultor = $state<ReporteConsultor | null>(null);
  let repIngresos = $state<ReporteIngresos | null>(null);
  let cargando = $state(false);
  let error = $state('');

  async function cargarCatalogos() {
    const res = await api<ApiResponse<Consultant[]>>('/honorarios/consultants?activos=true');
    consultores = res.data ?? [];
    if (!consultantId && consultores[0]) consultantId = consultores[0]._id;
  }

  async function cargarConsultor() {
    if (!consultantId) return;
    cargando = true;
    error = '';
    try {
      const params = new URLSearchParams({ desde, hasta });
      const res = await api<ApiResponse<ReporteConsultor>>(
        `/honorarios/reports/consultant/${consultantId}?${params}`
      );
      repConsultor = res.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error';
    } finally {
      cargando = false;
    }
  }

  async function cargarIngresos() {
    cargando = true;
    error = '';
    try {
      const params = new URLSearchParams({ desde, hasta });
      const res = await api<ApiResponse<ReporteIngresos>>(
        `/honorarios/reports/income?${params}`
      );
      repIngresos = res.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error';
    } finally {
      cargando = false;
    }
  }

  function buscar() {
    if (tab === 'consultor') cargarConsultor();
    else cargarIngresos();
  }

  onMount(async () => {
    if (!puedeAdmin) return;
    await cargarCatalogos();
    await cargarConsultor();
  });
</script>

<svelte:head>
  <title>Reportes honorarios — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Honorarios — Reportes</h1>
      <p>Por consultor e ingresos (TECH / LICENCIA)</p>
    </div>
    <div class="header-actions">
      <a href="/honorarios" class="btn btn-secondary">Consolidado</a>
      <a href="/honorarios/captura" class="btn btn-primary">Captura</a>
    </div>
  </header>

  {#if !puedeAdmin}
    <p class="estado">Solo administradores pueden usar este módulo.</p>
  {:else}
    <div class="tabs">
      <button
        type="button"
        class:active={tab === 'consultor'}
        onclick={() => {
          tab = 'consultor';
          cargarConsultor();
        }}>Por consultor</button
      >
      <button
        type="button"
        class:active={tab === 'ingresos'}
        onclick={() => {
          tab = 'ingresos';
          cargarIngresos();
        }}>Ingresos</button
      >
    </div>

    <section class="card filtros">
      {#if tab === 'consultor'}
        <div class="form-group">
          <label class="label" for="hr-c">Consultor</label>
          <select id="hr-c" class="select" bind:value={consultantId}>
            {#each consultores as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
      {/if}
      <div class="form-group">
        <label class="label" for="hr-d">Desde</label>
        <input id="hr-d" class="input" type="month" bind:value={desde} />
      </div>
      <div class="form-group">
        <label class="label" for="hr-h">Hasta</label>
        <input id="hr-h" class="input" type="month" bind:value={hasta} />
      </div>
      <button type="button" class="btn btn-secondary" onclick={buscar}>Buscar</button>
    </section>

    {#if error}<div class="alert alert-error">{error}</div>{/if}
    {#if cargando}
      <p class="estado">Cargando…</p>
    {:else if tab === 'consultor' && repConsultor}
      <section class="card">
        <h2>{repConsultor.consultor.nombre} — Total {money(repConsultor.total)}</h2>
        <table class="tabla">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Proyecto</th>
              <th>Rol</th>
              <th>%</th>
              <th>Monto</th>
              <th>1A Qna</th>
              <th>2da Qna</th>
            </tr>
          </thead>
          <tbody>
            {#each repConsultor.desglose as d}
              <tr>
                <td>{d.periodo}</td>
                <td>{d.proyecto}</td>
                <td>{d.rol}</td>
                <td>{pctLabel(d.pct)}</td>
                <td class="num">{money(d.monto)}</td>
                <td class="num">{money(d.q1)}</td>
                <td class="num">{money(d.q2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if repConsultor.desglose.length === 0}
          <p class="estado">Sin movimientos en el rango.</p>
        {/if}
      </section>
    {:else if tab === 'ingresos' && repIngresos}
      <section class="card">
        <h2>Por mes</h2>
        <table class="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Ingreso</th>
              <th>TECH</th>
              <th>LICENCIA</th>
              <th>GRUPO</th>
              <th>Neto</th>
            </tr>
          </thead>
          <tbody>
            {#each repIngresos.meses as m}
              <tr>
                <td>{m.periodo}</td>
                <td class="num">{money(m.ingresoTotal)}</td>
                <td class="num">{money(m.montoTech)}</td>
                <td class="num">{money(m.montoLicencia)}</td>
                <td class="num">{money(m.montoGrupo)}</td>
                <td class="num">{money(m.netoDistribuible)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>TOTAL</strong></td>
              <td class="num"><strong>{money(repIngresos.granTotal.ingresoTotal)}</strong></td>
              <td class="num"><strong>{money(repIngresos.granTotal.montoTech)}</strong></td>
              <td class="num"><strong>{money(repIngresos.granTotal.montoLicencia)}</strong></td>
              <td class="num"><strong>{money(repIngresos.granTotal.montoGrupo)}</strong></td>
              <td class="num"><strong>{money(repIngresos.granTotal.netoDistribuible)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section class="card">
        <h2>Por proyecto</h2>
        <table class="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Proyecto</th>
              <th>Ingreso</th>
              <th>TECH</th>
              <th>LICENCIA</th>
            </tr>
          </thead>
          <tbody>
            {#each repIngresos.porProyecto as p}
              <tr>
                <td>{p.periodo}</td>
                <td>{p.proyecto}</td>
                <td class="num">{money(p.ingresoTotal)}</td>
                <td class="num">{money(p.montoTech)}</td>
                <td class="num">{money(p.montoLicencia)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
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
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
  }
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .tabs button {
    border: 1px solid #e5e7eb;
    background: #fff;
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .tabs button.active {
    background: #1e3a5f;
    color: #fff;
    border-color: #1e3a5f;
  }
  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .filtros {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .tabla {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .tabla th,
  .tabla td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
