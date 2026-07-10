<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import Modal from '$lib/components/Modal.svelte';
  import type { ResumenFlujo } from '$lib/types/admin';

  let resumen = $state<ResumenFlujo | null>(null);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');
  let recalculando = $state(false);
  let guardandoConfig = $state(false);
  let mesSeleccionado = $state('');
  let modalConfig = $state(false);

  let formSaldoConsulting = $state('0');
  let formSaldoTech = $state('0');
  let formSaldoGrupo = $state('0');
  let formPorcentaje = $state('10');

  let puedeEditar = $derived($auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor');

  let mesVista = $derived.by(() => {
    if (!resumen) return null;
    if (mesSeleccionado) {
      return resumen.historialMensual.find((m) => m.periodo === mesSeleccionado) ?? null;
    }
    return resumen.resumenActual;
  });

  async function cargarDatos() {
    cargando = true;
    error = '';
    try {
      resumen = await api<ResumenFlujo>('/flujo/resumen');
      if (!mesSeleccionado) mesSeleccionado = resumen.mesActual;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar flujo';
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  onMount(() => cargarDatos());

  async function recalcular() {
    recalculando = true;
    mensaje = '';
    error = '';
    try {
      const data = await api<{ mensaje: string; resumen: ResumenFlujo }>('/flujo/recalcular', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      mensaje = data.mensaje;
      resumen = data.resumen;
      if (!mesSeleccionado) mesSeleccionado = resumen.mesActual;
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo recalcular';
    } finally {
      recalculando = false;
    }
  }

  function abrirConfig() {
    if (!resumen) return;
    formSaldoConsulting = String(resumen.configuracion.saldoAperturaConsulting);
    formSaldoTech = String(resumen.configuracion.saldoAperturaTechnologies);
    formSaldoGrupo = String(resumen.configuracion.saldoAperturaGrupo);
    formPorcentaje = String(resumen.configuracion.porcentajeAporteOficial);
    modalConfig = true;
  }

  async function guardarConfig() {
    guardandoConfig = true;
    error = '';
    try {
      await api('/flujo/configuracion', {
        method: 'PUT',
        body: JSON.stringify({
          saldoAperturaConsulting: Number(formSaldoConsulting),
          saldoAperturaTechnologies: Number(formSaldoTech),
          saldoAperturaGrupo: Number(formSaldoGrupo),
          porcentajeAporteOficial: Number(formPorcentaje),
        }),
      });
      modalConfig = false;
      mensaje = 'Configuración guardada. Pulsa Recalcular para actualizar saldos acumulados.';
      await cargarDatos();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo guardar';
    } finally {
      guardandoConfig = false;
    }
  }

  function claseCobertura(porcentaje: number): string {
    if (porcentaje >= 100) return 'activo';
    if (porcentaje >= 70) return 'alerta';
    return 'inactivo';
  }
</script>

{#if cargando}
  <p class="estado">Cargando flujo calculado...</p>
{:else}
  <div class="modulo-contenido">
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
    {#if error}<div class="alert alert-error">{error}</div>{/if}

    <section class="card acciones-panel">
      <div class="acciones">
        {#if puedeEditar}
          <button class="btn btn-primary btn-sm" disabled={recalculando} onclick={recalcular}>
            {recalculando ? 'Recalculando...' : 'Recalcular'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick={abrirConfig}>Configuración</button>
        {/if}
      </div>
      <p class="ayuda">
        Combina facturación (Módulo A) y nómina (Módulo B) con egresos Grupo del estado de cuenta
        clasificados por proveedor. Scope global de la firma. El saldo acumulado usa fórmula limpia
        — puede no coincidir con el histórico Excel.
      </p>
    </section>

    {#if resumen?.necesitaRecalculo}
      <div class="alert alert-warning">
        Aún no hay resumen cacheado. {#if puedeEditar}Pulsa <strong>Recalcular</strong> para generarlo.{/if}
      </div>
    {:else if resumen && mesVista}
      {#if mesVista.mesEnCurso}
        <div class="alert alert-info">Mes en curso — cifras preliminares (puede entrar más información).</div>
      {/if}
      {#if mesVista.advertenciaIncompleto}
        <div class="alert alert-warning">
          Datos incompletos: más del 5% de registros del mes siguen sin clasificar.
          Revisa Facturación, Nómina y mapa de proveedores.
        </div>
      {/if}

      <section class="card mes-panel">
        <div class="mes-header">
          <div>
            <h2>{mesVista.etiqueta}</h2>
            <p class="subtitulo">Flujo y aportación oficial ({resumen.configuracion.porcentajeAporteOficial}% Consulting)</p>
          </div>
          <div class="mes-header-derecha">
            {#if mesVista.registrosPendientes > 0}
              <span class="badge-pendientes">{mesVista.registrosPendientes} sin clasificar</span>
            {/if}
            <select class="select" bind:value={mesSeleccionado}>
              {#each resumen.historialMensual as mes}
                <option value={mes.periodo}>{mes.etiqueta}{mes.mesEnCurso ? ' (en curso)' : ''}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Aporte oficial ({resumen.configuracion.porcentajeAporteOficial}%)</span>
            <span class="stat-value consulting">{formatearMoneda(mesVista.aportacionOficial)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Egresos a cubrir</span>
            <span class="stat-value grupo">{formatearMoneda(mesVista.egresosTotalesACubrir)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">% cobertura oficial</span>
            <span class="stat-value {claseCobertura(mesVista.porcentajeCoberturaOficial)}">
              {mesVista.porcentajeCoberturaOficial}%
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Saldo caja neta (acum.)</span>
            <span class="stat-value">{formatearMoneda(mesVista.saldoAcumulado.total)}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Desglose de egresos a cubrir (mes)</h3>
        <div class="egresos-grid">
          <div class="egreso-item">
            <span class="egreso-label">Nómina Consulting</span>
            <span>{formatearMoneda(mesVista.egresos.consultingNomina)}</span>
          </div>
          <div class="egreso-item">
            <span class="egreso-label">Nómina Technologies</span>
            <span>{formatearMoneda(mesVista.egresos.technologiesNomina)}</span>
          </div>
          <div class="egreso-item">
            <span class="egreso-label">Egresos directos Grupo</span>
            <span>{formatearMoneda(mesVista.egresos.grupoDirecto)}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Tablero mensual por unidad</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th></th>
                <th colspan="3">Ingresos</th>
                <th colspan="3">Egresos / nómina</th>
                <th colspan="3">Resultado neto</th>
                <th colspan="3">Saldo acumulado</th>
                <th>Aporte oficial</th>
                <th>% cob.</th>
              </tr>
              <tr class="subhead">
                <th></th>
                <th>Estado</th>
                <th>C</th><th>T</th><th>G</th>
                <th>Nóm.C</th><th>Nóm.T</th><th>G dir.</th>
                <th>C</th><th>T</th><th>G</th>
                <th>C</th><th>T</th><th>G</th>
                <th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {#each resumen.historialMensual as fila (fila.periodo)}
                <tr class:mes-activo={fila.periodo === mesSeleccionado} class:mes-curso={fila.mesEnCurso}>
                  <td><strong>{fila.etiqueta}</strong></td>
                  <td class="celda-estado">
                    {#if fila.mesEnCurso}<span class="badge badge-curso">En curso</span>{/if}
                    {#if fila.registrosPendientes > 0}
                      <span class="badge badge-pendiente">{fila.registrosPendientes} pend.</span>
                    {/if}
                  </td>
                  <td>{formatearMoneda(fila.ingresos.consulting)}</td>
                  <td>{formatearMoneda(fila.ingresos.technologies)}</td>
                  <td>{formatearMoneda(fila.ingresos.grupo)}</td>
                  <td>{formatearMoneda(fila.egresos.consultingNomina)}</td>
                  <td>{formatearMoneda(fila.egresos.technologiesNomina)}</td>
                  <td>{formatearMoneda(fila.egresos.grupoDirecto)}</td>
                  <td class="consulting">{formatearMoneda(fila.resultadoNeto.consulting)}</td>
                  <td class="technologies">{formatearMoneda(fila.resultadoNeto.technologies)}</td>
                  <td class="grupo">{formatearMoneda(fila.resultadoNeto.grupo)}</td>
                  <td>{formatearMoneda(fila.saldoAcumulado.consulting)}</td>
                  <td>{formatearMoneda(fila.saldoAcumulado.technologies)}</td>
                  <td>{formatearMoneda(fila.saldoAcumulado.grupo)}</td>
                  <td>{formatearMoneda(fila.aportacionOficial)}</td>
                  <td class={claseCobertura(fila.porcentajeCoberturaOficial)}>
                    {fila.porcentajeCoberturaOficial}%
                  </td>
                </tr>
              {/each}
              <tr class="total-fila">
                <td colspan="2"><strong>Acumulado aporte / egresos</strong></td>
                <td colspan="12"></td>
                <td><strong>{formatearMoneda(resumen.totales.aportacionOficialAcumulada)}</strong></td>
                <td><strong>{resumen.totales.porcentajeCoberturaAcumulado}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </div>
{/if}

<Modal abierto={modalConfig} titulo="Configuración de flujo" onCerrar={() => (modalConfig = false)}>
  <div class="form-grid">
    <div class="form-group">
      <label class="label" for="saldo-c">Saldo apertura Consulting</label>
      <input id="saldo-c" class="input" type="number" bind:value={formSaldoConsulting} />
    </div>
    <div class="form-group">
      <label class="label" for="saldo-t">Saldo apertura Technologies</label>
      <input id="saldo-t" class="input" type="number" bind:value={formSaldoTech} />
    </div>
    <div class="form-group">
      <label class="label" for="saldo-g">Saldo apertura Grupo</label>
      <input id="saldo-g" class="input" type="number" bind:value={formSaldoGrupo} />
    </div>
    <div class="form-group full">
      <label class="label" for="pct-aporte">% aporte oficial (sobre ingresos Consulting)</label>
      <input id="pct-aporte" class="input" type="number" min="0" max="100" step="0.1" bind:value={formPorcentaje} />
    </div>
  </div>
  <p class="nota-config">Tras cambiar saldos de apertura o porcentaje, pulsa <strong>Recalcular</strong>.</p>
  <div class="modal-actions">
    <button class="btn btn-secondary" onclick={() => (modalConfig = false)}>Cancelar</button>
    <button class="btn btn-primary" disabled={guardandoConfig} onclick={guardarConfig}>
      {guardandoConfig ? 'Guardando...' : 'Guardar'}
    </button>
  </div>
</Modal>

<style>
  .modulo-contenido { display: flex; flex-direction: column; gap: 1rem; }
  .acciones-panel { padding: 1rem; }
  .acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .ayuda { font-size: 0.82rem; color: var(--color-text-muted); margin: 0; }
  .mes-panel { padding: 1.25rem; }
  .mes-header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .mes-header h2 { font-size: 1.15rem; margin-bottom: 0.25rem; }
  .mes-header-derecha { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .subtitulo { color: var(--color-text-muted); font-size: 0.85rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; }
  .stat-card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.875rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.2rem; font-weight: 700; }
  .stat-value.consulting, .consulting { color: #4f46e5; }
  .stat-value.technologies, .technologies { color: #0891b2; }
  .stat-value.grupo, .grupo { color: var(--color-danger); }
  .stat-value.activo { color: var(--color-success); }
  .stat-value.alerta { color: var(--color-warning); }
  .stat-value.inactivo { color: var(--color-danger); }
  .egresos-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .egreso-item { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius); }
  .egreso-label { font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; }
  .badge-pendientes, .badge-pendiente { font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 999px; background: #fef3c7; color: #92400e; font-weight: 600; }
  .badge-curso { font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 999px; background: #dbeafe; color: #1e40af; font-weight: 600; }
  .celda-estado { display: flex; flex-direction: column; gap: 0.2rem; min-width: 5rem; }
  .subhead th { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 600; }
  tr.mes-activo { background: #eef2ff; }
  tr.mes-curso td:first-child { border-left: 3px solid #3b82f6; }
  .total-fila { background: #f8fafc; font-weight: 600; }
  .card { padding: 1rem; }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .form-grid .full { grid-column: 1 / -1; }
  .nota-config { font-size: 0.82rem; color: var(--color-text-muted); margin: 0.75rem 0 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  .estado { color: var(--color-text-muted); }
</style>
