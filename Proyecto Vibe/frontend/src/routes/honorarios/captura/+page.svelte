<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import {
    money,
    pctLabel,
    type ApiResponse,
    type CalculoDistribucion,
    type Consultant,
    type HonorarioProject,
    type MonthlyDistribution,
    type PercentagePreset,
    type RolHonorario,
  } from '$lib/types/honorarios';

  let puedeAdmin = $derived($auth.usuario?.rol === 'admin');

  let consultores = $state<Consultant[]>([]);
  let proyectos = $state<HonorarioProject[]>([]);
  let presets = $state<PercentagePreset[]>([]);
  let projectId = $state('');
  let periodo = $state(new Date().toISOString().slice(0, 7));
  let ingreso1aQna = $state(0);
  let ingreso2daQna = $state(0);
  let pctTech = $state(0.05);
  let pctLicencia = $state(0.2);
  let pctGrupo = $state(0.1);
  let pctIva = $state(0.16);
  let grupoConsultantId = $state('');
  let observaciones = $state('');
  let asignaciones = $state<
    { consultantId: string; rol: RolHonorario; pct: number }[]
  >([]);
  let calculo = $state<CalculoDistribucion | null>(null);
  let distId = $state<string | null>(null);
  let cargando = $state(false);
  let guardando = $state(false);
  let error = $state('');
  let mensaje = $state('');
  let presetId = $state('');

  const ROLES: RolHonorario[] = ['FINDER', 'CLOSER', 'EJECUCION'];

  async function cargarCatalogos() {
    const [c, p, pr] = await Promise.all([
      api<ApiResponse<Consultant[]>>('/honorarios/consultants?activos=true'),
      api<ApiResponse<HonorarioProject[]>>('/honorarios/projects?activos=true'),
      api<ApiResponse<PercentagePreset[]>>('/honorarios/presets'),
    ]);
    consultores = c.data ?? [];
    proyectos = p.data ?? [];
    presets = pr.data ?? [];
    if (!projectId && proyectos[0]) projectId = proyectos[0]._id;
  }

  async function cargarBorrador() {
    if (!projectId || !periodo) return;
    cargando = true;
    error = '';
    try {
      const res = await api<ApiResponse<MonthlyDistribution>>(
        `/honorarios/monthly-distributions/borrador?projectId=${projectId}&periodo=${periodo}`
      );
      const d = res.data;
      distId = d._id;
      ingreso1aQna = d.ingreso1aQna ?? 0;
      ingreso2daQna = d.ingreso2daQna ?? 0;
      pctTech = d.pctTech;
      pctLicencia = d.pctLicencia;
      pctGrupo = d.pctGrupo;
      pctIva = d.pctIva ?? 0.16;
      grupoConsultantId =
        typeof d.grupoConsultantId === 'object' && d.grupoConsultantId
          ? d.grupoConsultantId._id
          : String(d.grupoConsultantId ?? '');
      observaciones = d.observaciones ?? '';
      asignaciones = (d.asignaciones ?? []).map((a) => ({
        consultantId:
          typeof a.consultantId === 'object' ? a.consultantId._id : String(a.consultantId),
        rol: a.rol,
        pct: a.pct,
      }));
      calculo = d.calculo ?? null;
      await refrescarPreview();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo cargar';
    } finally {
      cargando = false;
    }
  }

  async function refrescarPreview() {
    try {
      const res = await api<ApiResponse<CalculoDistribucion>>(
        '/honorarios/monthly-distributions/preview',
        {
          method: 'POST',
          body: JSON.stringify({
            ingreso1aQna,
            ingreso2daQna,
            pctTech,
            pctLicencia,
            pctGrupo,
            pctIva,
            asignaciones,
          }),
        }
      );
      calculo = res.data;
    } catch {
      /* preview opcional */
    }
  }

  function aplicarPreset() {
    const p = presets.find((x) => x._id === presetId);
    if (!p) return;
    pctTech = p.pctTech;
    pctLicencia = p.pctLicencia;
    pctGrupo = p.pctGrupo;
    if (asignaciones.length === 0 && consultores.length >= 3) {
      asignaciones = [
        { consultantId: consultores[0]._id, rol: 'FINDER', pct: p.pctFinder },
        { consultantId: consultores[1]._id, rol: 'CLOSER', pct: p.pctCloser },
        { consultantId: consultores[2]._id, rol: 'EJECUCION', pct: p.pctEjecucion },
      ];
    } else {
      for (const a of asignaciones) {
        if (a.rol === 'FINDER') a.pct = p.pctFinder;
        if (a.rol === 'CLOSER') a.pct = p.pctCloser;
        if (a.rol === 'EJECUCION') a.pct = p.pctEjecucion;
      }
      asignaciones = [...asignaciones];
    }
    refrescarPreview();
  }

  function agregarAsignacion() {
    asignaciones = [
      ...asignaciones,
      {
        consultantId: consultores[0]?._id ?? '',
        rol: 'EJECUCION',
        pct: 0,
      },
    ];
    refrescarPreview();
  }

  function quitarAsignacion(i: number) {
    asignaciones = asignaciones.filter((_, idx) => idx !== i);
    refrescarPreview();
  }

  async function guardar() {
    if (!projectId) {
      error = 'Selecciona un proyecto';
      return;
    }
    guardando = true;
    error = '';
    mensaje = '';
    try {
      const res = await api<ApiResponse<MonthlyDistribution>>('/honorarios/monthly-distributions', {
        method: 'PUT',
        body: JSON.stringify({
          projectId,
          periodo,
          ingreso1aQna,
          ingreso2daQna,
          pctTech,
          pctLicencia,
          pctGrupo,
          pctIva,
          grupoConsultantId: grupoConsultantId || null,
          asignaciones,
          observaciones,
        }),
      });
      distId = res.data._id;
      calculo = res.data.calculo ?? null;
      mensaje = 'Distribución guardada';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar';
    } finally {
      guardando = false;
    }
  }

  onMount(async () => {
    if (!puedeAdmin) return;
    const sp = $page.url.searchParams;
    const qProject = sp.get('projectId');
    const qPeriodo = sp.get('periodo');
    if (qPeriodo && /^\d{4}-\d{2}$/.test(qPeriodo)) periodo = qPeriodo;
    await cargarCatalogos();
    if (qProject && proyectos.some((p) => p._id === qProject)) {
      projectId = qProject;
    }
    await cargarBorrador();
  });
</script>

<svelte:head>
  <title>Captura honorarios — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Honorarios Consulting — Captura</h1>
      <p>Ingresos sin IVA por quincena; deducciones y roles sobre el valor del proyecto; IVA se calcula al final</p>
    </div>
    <div class="header-actions">
      <a href="/honorarios" class="btn btn-secondary">Vista consolidada</a>
      <a href="/honorarios/reportes" class="btn btn-secondary">Reportes</a>
    </div>
  </header>

  {#if !puedeAdmin}
    <p class="estado">Solo administradores pueden usar este módulo.</p>
  {:else}
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
    {#if error}<div class="alert alert-error">{error}</div>{/if}

    <section class="card filtros">
      <div class="form-group">
        <label class="label" for="hc-proy">Proyecto</label>
        <select
          id="hc-proy"
          class="select"
          bind:value={projectId}
          onchange={() => cargarBorrador()}
        >
          {#each proyectos as p}
            <option value={p._id}>{p.nombre}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="hc-mes">Mes</label>
        <input
          id="hc-mes"
          class="input"
          type="month"
          bind:value={periodo}
          onchange={() => cargarBorrador()}
        />
      </div>
      <div class="form-group">
        <label class="label" for="hc-preset">Preset</label>
        <select id="hc-preset" class="select" bind:value={presetId} onchange={aplicarPreset}>
          <option value="">— Aplicar preset —</option>
          {#each presets as pr}
            <option value={pr._id}>{pr.nombre}</option>
          {/each}
        </select>
      </div>
    </section>

    {#if cargando}
      <p class="estado">Cargando…</p>
    {:else}
      <section class="card grid-2">
        <div class="form-group">
          <label class="label" for="hc-q1">Ingreso 1a quincena (sin IVA)</label>
          <input
            id="hc-q1"
            class="input"
            type="number"
            step="0.01"
            min="0"
            bind:value={ingreso1aQna}
            oninput={() => refrescarPreview()}
          />
        </div>
        <div class="form-group">
          <label class="label" for="hc-q2">Ingreso 2da quincena (sin IVA)</label>
          <input
            id="hc-q2"
            class="input"
            type="number"
            step="0.01"
            min="0"
            bind:value={ingreso2daQna}
            oninput={() => refrescarPreview()}
          />
        </div>
        <div class="form-group">
          <label class="label" for="hc-tech">% TECH</label>
          <input
            id="hc-tech"
            class="input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            bind:value={pctTech}
            oninput={() => refrescarPreview()}
          />
          <span class="hint">{pctLabel(pctTech)}</span>
        </div>
        <div class="form-group">
          <label class="label" for="hc-lic">% LICENCIA</label>
          <input
            id="hc-lic"
            class="input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            bind:value={pctLicencia}
            oninput={() => refrescarPreview()}
          />
          <span class="hint">{pctLabel(pctLicencia)}</span>
        </div>
        <div class="form-group">
          <label class="label" for="hc-grupo">% GRUPO</label>
          <input
            id="hc-grupo"
            class="input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            bind:value={pctGrupo}
            oninput={() => refrescarPreview()}
          />
          <span class="hint">{pctLabel(pctGrupo)}</span>
        </div>
        <div class="form-group">
          <label class="label" for="hc-iva">% IVA</label>
          <input
            id="hc-iva"
            class="input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            bind:value={pctIva}
            oninput={() => refrescarPreview()}
          />
          <span class="hint">{pctLabel(pctIva)} — sobre valor sin IVA (0% = exento)</span>
        </div>
        <div class="form-group">
          <label class="label" for="hc-grupo-c">Consultor GRUPO</label>
          <select id="hc-grupo-c" class="select" bind:value={grupoConsultantId}>
            <option value="">— Sin asignar —</option>
            {#each consultores as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group full">
          <label class="label" for="hc-obs">Observaciones</label>
          <input id="hc-obs" class="input" bind:value={observaciones} />
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Asignaciones de rol</h2>
          <button type="button" class="btn btn-secondary" onclick={agregarAsignacion}>+ Fila</button>
        </div>
        <table class="tabla">
          <thead>
            <tr>
              <th>Consultor</th>
              <th>Rol</th>
              <th>%</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each asignaciones as a, i}
              <tr>
                <td>
                  <select
                    class="select"
                    bind:value={a.consultantId}
                    onchange={() => refrescarPreview()}
                  >
                    {#each consultores as c}
                      <option value={c._id}>{c.nombre}</option>
                    {/each}
                  </select>
                </td>
                <td>
                  <select class="select" bind:value={a.rol} onchange={() => refrescarPreview()}>
                    {#each ROLES as r}
                      <option value={r}>{r}</option>
                    {/each}
                  </select>
                </td>
                <td>
                  <input
                    class="input"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    bind:value={a.pct}
                    oninput={() => refrescarPreview()}
                  />
                  <span class="hint">{pctLabel(a.pct)}</span>
                </td>
                <td>
                  <button type="button" class="btn btn-ghost" onclick={() => quitarAsignacion(i)}
                    >✕</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      {#if calculo}
        <section class="card preview">
          <h2>Vista previa</h2>
          {#if calculo.advertenciaPct}
            <div class="alert alert-warn">{calculo.advertenciaPct}</div>
          {/if}
          <div class="kpi-row">
            <div><span class="muted">Ingreso total (sin IVA)</span><strong>{money(calculo.ingresoTotal)}</strong></div>
            <div><span class="muted">TECH</span><strong>{money(calculo.montoTech)}</strong></div>
            <div><span class="muted">LICENCIA</span><strong>{money(calculo.montoLicencia)}</strong></div>
            <div><span class="muted">Neto (ref.)</span><strong>{money(calculo.netoDistribuible)}</strong></div>
            <div><span class="muted">GRUPO</span><strong>{money(calculo.montoGrupo)}</strong></div>
            <div><span class="muted">Total pagado</span><strong>{money(calculo.totalPagado)}</strong></div>
            <div>
              <span class="muted">Diferencia vs ingreso</span>
              <strong class:warn={Math.abs(calculo.diferenciaIngreso) > 0.01}
                >{money(calculo.diferenciaIngreso)}</strong
              >
            </div>
            <div><span class="muted">IVA ({pctLabel(calculo.pctIva)})</span><strong>{money(calculo.montoIva)}</strong></div>
            <div><span class="muted">Total con IVA</span><strong>{money(calculo.totalConIva)}</strong></div>
          </div>
          <table class="tabla">
            <thead>
              <tr>
                <th>Rol</th>
                <th>%</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {#each calculo.asignaciones as a}
                <tr>
                  <td>{a.rol}</td>
                  <td>{pctLabel(a.pct)}</td>
                  <td>{money(a.monto)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}

      <div class="modal-actions">
        <button type="button" class="btn btn-primary" disabled={guardando} onclick={guardar}>
          {guardando ? 'Guardando…' : distId ? 'Actualizar' : 'Guardar'}
        </button>
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
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
  }
  .card {
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .filtros,
  .grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  .full {
    grid-column: 1 / -1;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .hint {
    font-size: 0.8rem;
    color: #64748b;
  }
  .muted {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
  }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .warn {
    color: #b45309;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .tabla {
    width: 100%;
    border-collapse: collapse;
  }
  .tabla th,
  .tabla td {
    padding: 0.4rem;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
  }
  .alert-warn {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    color: #92400e;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.75rem;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
