<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { MesAportacion, ResumenModulo } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let error = $state('');
  let cargando = $state(true);
  let mesSeleccionado = $state('');

  let aportaciones = $derived(resumen?.aportacionesGrupo ?? null);

  let mesVista = $derived.by(() => {
    if (!aportaciones) return null;
    if (mesSeleccionado) {
      return aportaciones.historialMensual.find((m) => m.mes === mesSeleccionado) ?? null;
    }
    return aportaciones.actual;
  });

  let maxAporte = $derived(
    Math.max(
      ...(aportaciones?.historialMensual.map(
        (m) => m.aporteConsulting + m.aporteTechnologies
      ) ?? [1]),
      1
    )
  );

  async function cargarDatos() {
    cargando = true;
    error = '';

    for (const tipo of ['aportaciones-grupo', 'resumen-mensual']) {
      try {
        const data = await api<ResumenModulo>(`/excel/ultima/${tipo}`);
        if (data.aportacionesGrupo) {
          resumen = data;
          mesSeleccionado = data.aportacionesGrupo.mesActual;
          cargando = false;
          return;
        }
      } catch {
        // intentar siguiente fuente
      }
    }

    error =
      'No hay datos de aportaciones. Importa la hoja "Aportaciones Históricas 2026" o "Resumen Mensual" en Datos Excel.';
    resumen = null;
    cargando = false;
  }

  onMount(() => cargarDatos());

  function claseCobertura(porcentaje: number): string {
    if (porcentaje >= 100) return 'activo';
    if (porcentaje >= 70) return 'alerta';
    return 'inactivo';
  }

  function etiquetaMes(mes: string): string {
    return mes.replace(' (proy.)', ' · proy.').replace('2026-', '');
  }

  function etiquetaAporte(monto: number): string {
    return monto < 0 ? 'Retiró del pool' : 'Aportó al pool este mes';
  }
</script>

{#if cargando}
  <p class="estado">Cargando aportaciones al Grupo...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">Importa la hoja desde <a href="/datos-excel">Datos Excel</a>.</p>
  </div>
{:else if aportaciones && mesVista}
  <div class="modulo-contenido">
    <div class="meta-info card">
      <p>
        <strong>{resumen?.importacion.nombreArchivo}</strong> · {resumen?.importacion.nombreHoja}
        · Fuente: {aportaciones.fuente === 'aportaciones-historicas' ? 'Aportaciones históricas' : 'Resumen mensual'}
      </p>
    </div>

    <section class="card mes-actual-panel">
      <div class="mes-actual-header">
        <div>
          <h2>Mes en curso: {etiquetaMes(aportaciones.mesActual)}</h2>
          <p class="subtitulo">Gastos de Grupo vs. aportaciones por unidad y faltante por cubrir</p>
        </div>
        <div class="form-group mes-selector">
          <label class="label" for="mes-aportacion">Ver otro mes</label>
          <select id="mes-aportacion" class="select" bind:value={mesSeleccionado}>
            {#each aportaciones.meses as mes}
              <option value={mes}>{etiquetaMes(mes)}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Egresos Grupo (proyectado)</span>
          <span class="stat-value inactivo">{formatearMoneda(mesVista.egresosGrupo)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Aporte 10% Consulting</span>
          <span class="stat-value">{formatearMoneda(mesVista.aporte10Consulting)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Gap por cubrir</span>
          <span class="stat-value alerta">{formatearMoneda(mesVista.gapPorCubrir)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">% cobertura</span>
          <span class="stat-value {claseCobertura(mesVista.porcentajeCobertura)}">
            {mesVista.porcentajeCobertura}%
          </span>
        </div>
      </div>

      <div class="unidades-grid">
        <div class="unidad-card consulting">
          <span class="unidad-nombre">Consulting</span>
          <span class="unidad-monto" class:retiro={mesVista.aporteConsulting < 0}>
            {formatearMoneda(Math.abs(mesVista.aporteConsulting))}
          </span>
          <span class="unidad-detalle">{etiquetaAporte(mesVista.aporteConsulting)}</span>
        </div>
        <div class="unidad-card technologies">
          <span class="unidad-nombre">Technologies</span>
          <span class="unidad-monto" class:retiro={mesVista.aporteTechnologies < 0}>
            {formatearMoneda(Math.abs(mesVista.aporteTechnologies))}
          </span>
          <span class="unidad-detalle">{etiquetaAporte(mesVista.aporteTechnologies)}</span>
        </div>
        <div class="unidad-card grupo">
          <span class="unidad-nombre">Grupo</span>
          <span class="unidad-monto">{formatearMoneda(mesVista.egresosGrupo)}</span>
          <span class="unidad-detalle">Egresos a cubrir</span>
        </div>
        <div class="unidad-card faltante">
          <span class="unidad-nombre">Faltante</span>
          <span class="unidad-monto">{formatearMoneda(mesVista.faltantePorCubrir)}</span>
          <span class="unidad-detalle">Por cubrir según aportes reales</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>Historial mensual — aportaciones por unidad</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Egresos Grupo</th>
              <th>Consulting</th>
              <th>Technologies</th>
              <th>Gap / Faltante</th>
              <th>% cobertura</th>
            </tr>
          </thead>
          <tbody>
            {#each aportaciones.historialMensual as fila}
              <tr class:mes-activo={fila.mes === mesSeleccionado}>
                <td><strong>{etiquetaMes(fila.mes)}</strong></td>
                <td>{formatearMoneda(fila.egresosGrupo)}</td>
                <td class="consulting" class:retiro={fila.aporteConsulting < 0}>
                  {formatearMoneda(fila.aporteConsulting)}
                </td>
                <td class="technologies" class:retiro={fila.aporteTechnologies < 0}>
                  {formatearMoneda(fila.aporteTechnologies)}
                </td>
                <td class="alerta">{formatearMoneda(fila.faltantePorCubrir || fila.gapPorCubrir)}</td>
                <td class={claseCobertura(fila.porcentajeCobertura)}>{fila.porcentajeCobertura}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card grafica-panel">
      <h3>Aportes Consulting + Technologies por mes</h3>
      <div class="barras">
        {#each aportaciones.historialMensual as fila}
          {@const total = fila.aporteConsulting + fila.aporteTechnologies}
          {@const pct = Math.round((total / maxAporte) * 100)}
          <div class="barra-item">
            <div class="barra-etiqueta">{etiquetaMes(fila.mes)}</div>
            <div class="barra-contenedor">
              <div
                class="barra-consulting"
                style="width: {pct > 0 ? Math.max(4, (fila.aporteConsulting / maxAporte) * 100) : 0}%"
              ></div>
              <div
                class="barra-tech"
                style="width: {pct > 0 ? Math.max(4, (fila.aporteTechnologies / maxAporte) * 100) : 0}%"
              ></div>
            </div>
            <div class="barra-valores">
              <span class="consulting">C: {formatearMoneda(fila.aporteConsulting)}</span>
              <span class="technologies">T: {formatearMoneda(fila.aporteTechnologies)}</span>
            </div>
          </div>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .modulo-contenido { display: flex; flex-direction: column; gap: 1.25rem; }
  .meta-info { padding: 0.875rem 1rem; font-size: 0.875rem; color: var(--color-text-muted); }
  .mes-actual-panel { padding: 1.25rem; }
  .mes-actual-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .mes-actual-header h2 { font-size: 1.15rem; margin-bottom: 0.25rem; }
  .subtitulo { color: var(--color-text-muted); font-size: 0.875rem; }
  .mes-selector { min-width: 180px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
  .stat-card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.875rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.35rem; font-weight: 700; color: var(--color-primary); }
  .stat-value.activo, .consulting { color: #4f46e5; }
  .stat-value.inactivo, .grupo { color: var(--color-danger); }
  .stat-value.alerta, .alerta { color: var(--color-warning); }
  .stat-value.technologies, .technologies { color: #0891b2; }
  .unidades-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .unidad-card { border-radius: var(--radius); padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; border: 1px solid var(--color-border); }
  .unidad-card.consulting { border-left: 4px solid #4f46e5; }
  .unidad-card.technologies { border-left: 4px solid #0891b2; }
  .unidad-card.grupo { border-left: 4px solid var(--color-danger); }
  .unidad-card.faltante { border-left: 4px solid var(--color-warning); background: #fffbeb; }
  .unidad-nombre { font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .unidad-monto { font-size: 1.25rem; font-weight: 700; }
  .unidad-monto.retiro, .retiro { color: var(--color-danger); }
  .unidad-detalle { font-size: 0.8rem; color: var(--color-text-muted); }
  .card { padding: 1rem; }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .mes-activo { background: #eef2ff; }
  .barras { display: flex; flex-direction: column; gap: 0.75rem; }
  .barra-item { display: grid; grid-template-columns: 90px 1fr 200px; gap: 0.75rem; align-items: center; }
  .barra-etiqueta { font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); }
  .barra-contenedor { display: flex; height: 12px; background: var(--color-border); border-radius: 999px; overflow: hidden; }
  .barra-consulting { height: 100%; background: #4f46e5; }
  .barra-tech { height: 100%; background: #0891b2; }
  .barra-valores { display: flex; flex-direction: column; font-size: 0.75rem; text-align: right; }
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }

  @media (max-width: 768px) {
    .barra-item { grid-template-columns: 1fr; }
    .barra-valores { text-align: left; }
  }
</style>
