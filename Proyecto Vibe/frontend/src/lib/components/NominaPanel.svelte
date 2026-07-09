<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import Modal from '$lib/components/Modal.svelte';
  import type { Colaborador, NominaPago, ResumenNomina, TipoNomina } from '$lib/types/admin';

  type Tab = 'resumen' | 'colaboradores';
  type UnidadPago = 'Consulting' | 'Technologies' | 'Grupo';

  let tab = $state<Tab>('resumen');
  let resumen = $state<ResumenNomina | null>(null);
  let colaboradores = $state<Colaborador[]>([]);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');
  let reclasificando = $state(false);
  let importando = $state(false);
  let soloSinClasificar = $state(false);
  let guardandoUnidad = $state('');

  let modalAbierto = $state(false);
  let modoEdicion = $state(false);
  let editandoId = $state('');
  let guardando = $state(false);
  let formNombre = $state('');
  let formUnidad = $state<Colaborador['unidadBase']>('Consulting');
  let formTipo = $state<Colaborador['tipoRelacion']>('colaborador');
  let formTipoNomina = $state<TipoNomina>('honorarios_por_proyecto');
  let formNotas = $state('');

  let puedeEditar = $derived($auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor');

  async function cargarNomina() {
    cargando = true;
    error = '';
    const params = new URLSearchParams();
    if (soloSinClasificar) params.set('soloSinClasificar', 'true');
    try {
      resumen = await api<ResumenNomina>(`/nomina/resumen${params.toString() ? `?${params}` : ''}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar nómina';
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  async function cargarColaboradores() {
    try {
      const data = await api<{ colaboradores: Colaborador[] }>('/colaboradores');
      colaboradores = data.colaboradores;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar colaboradores';
    }
  }

  onMount(async () => {
    await Promise.all([cargarNomina(), cargarColaboradores()]);
  });

  async function reclasificar() {
    reclasificando = true;
    mensaje = '';
    try {
      const data = await api<{ mensaje: string }>('/nomina/reclasificar', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      mensaje = data.mensaje;
      await cargarNomina();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo reclasificar';
    } finally {
      reclasificando = false;
    }
  }

  async function importarUltima() {
    importando = true;
    mensaje = '';
    try {
      const data = await api<{ mensaje: string }>('/nomina/importar-ultima', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      mensaje = data.mensaje;
      await cargarNomina();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No hay importación de Nómina Real';
    } finally {
      importando = false;
    }
  }

  async function cambiarUnidadPago(pago: NominaPago, unidad: UnidadPago) {
    if (!puedeEditar) return;
    guardandoUnidad = pago._id;
    try {
      await api(`/nomina/pagos/${pago._id}`, {
        method: 'PUT',
        body: JSON.stringify({ unidadClasificada: unidad }),
      });
      await cargarNomina();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo actualizar la unidad';
    } finally {
      guardandoUnidad = '';
    }
  }

  function etiquetaEstado(estado: string): string {
    if (estado === 'auto_confirmado') return 'Confirmado';
    if (estado === 'manual') return 'Manual';
    return 'Sin clasificar';
  }

  function claseBadge(estado: string): string {
    if (estado === 'auto_confirmado') return 'confirmada';
    if (estado === 'manual') return 'manual';
    return 'sin-clasificar';
  }

  function etiquetaTipo(tipo: Colaborador['tipoRelacion'] | 'empleado'): string {
    if (tipo === 'honorarios_externos') return 'Honorarios externos';
    if (tipo === 'socio') return 'Socio';
    return 'Colaborador';
  }

  function etiquetaTipoNomina(tipo: TipoNomina): string {
    if (tipo === 'honorarios_por_proyecto') return 'Honorarios por proyecto';
    if (tipo === 'sueldo_y_comisiones') return 'Sueldo y comisiones';
    return 'Honorarios externos';
  }

  function inferirTipoNomina(unidad: Colaborador['unidadBase'], tipo: Colaborador['tipoRelacion']): TipoNomina {
    if (tipo === 'honorarios_externos') return 'honorarios_externos';
    if (unidad === 'Technologies') return 'sueldo_y_comisiones';
    return 'honorarios_por_proyecto';
  }

  function abrirCrear() {
    modoEdicion = false;
    editandoId = '';
    formNombre = '';
    formUnidad = 'Consulting';
    formTipo = 'colaborador';
    formTipoNomina = 'honorarios_por_proyecto';
    formNotas = '';
    modalAbierto = true;
  }

  function abrirEditar(item: Colaborador) {
    modoEdicion = true;
    editandoId = item._id;
    formNombre = item.nombre;
    formUnidad = item.unidadBase;
    formTipo = item.tipoRelacion;
    formTipoNomina = item.tipoNomina;
    formNotas = item.notas ?? '';
    modalAbierto = true;
  }

  async function guardarColaborador() {
    guardando = true;
    error = '';
    try {
      const body = {
        nombre: formNombre,
        unidadBase: formUnidad,
        tipoRelacion: formTipo,
        tipoNomina: formTipoNomina,
        notas: formNotas,
      };
      if (modoEdicion) {
        await api(`/colaboradores/${editandoId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/colaboradores', { method: 'POST', body: JSON.stringify(body) });
      }
      modalAbierto = false;
      mensaje = modoEdicion ? 'Colaborador actualizado' : 'Colaborador agregado';
      await cargarColaboradores();
      await cargarNomina();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo guardar';
    } finally {
      guardando = false;
    }
  }

  function onCambioUnidadForm() {
    if (formTipo !== 'honorarios_externos') {
      formTipoNomina = inferirTipoNomina(formUnidad, formTipo);
    }
  }

  function onCambioTipoForm() {
    if (formTipo === 'honorarios_externos') {
      formTipoNomina = 'honorarios_externos';
      formUnidad = 'Grupo';
    } else {
      formTipoNomina = inferirTipoNomina(formUnidad, formTipo);
    }
  }

  let internos = $derived(colaboradores.filter((c) => c.tipoRelacion !== 'honorarios_externos'));
  let externos = $derived(colaboradores.filter((c) => c.tipoRelacion === 'honorarios_externos'));
</script>

{#if cargando && !resumen}
  <p class="estado">Cargando nómina...</p>
{:else}
  <div class="modulo-contenido">
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
    {#if error}<div class="alert alert-error">{error}</div>{/if}

    <div class="tabs">
      <button class:active={tab === 'resumen'} onclick={() => (tab = 'resumen')}>Resumen y pagos</button>
      <button class:active={tab === 'colaboradores'} onclick={() => (tab = 'colaboradores')}>
        Catálogo ({colaboradores.length})
      </button>
    </div>

    {#if tab === 'resumen'}
      <section class="card acciones-panel">
        <div class="acciones">
          {#if puedeEditar}
            <button class="btn btn-secondary btn-sm" disabled={importando} onclick={importarUltima}>
              {importando ? 'Importando...' : 'Sincronizar desde Nómina Real'}
            </button>
            <button class="btn btn-secondary btn-sm" disabled={reclasificando} onclick={reclasificar}>
              {reclasificando ? 'Reclasificando...' : 'Reclasificar automático'}
            </button>
          {/if}
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={soloSinClasificar}
              onchange={() => cargarNomina()}
            />
            Solo sin clasificar
          </label>
        </div>
        <p class="ayuda">
          Consulting: honorarios por proyecto → 100% Consulting. Technologies: sueldo + comisiones → 100% Technologies.
          Puedes cambiar la unidad de cualquier pago en la tabla. Los pagos manuales no se sobrescriben al reclasificar.
        </p>
      </section>

      {#if resumen}
        <div class="stats-grid">
          <div class="stat-card card">
            <span class="stat-label">Pagos</span>
            <span class="stat-value">{resumen.clasificacion.total}</span>
          </div>
          <div class="stat-card card">
            <span class="stat-label">Monto total</span>
            <span class="stat-value">{formatearMoneda(resumen.clasificacion.montoTotal)}</span>
          </div>
          <div class="stat-card card">
            <span class="stat-label">Confirmados</span>
            <span class="stat-value activo">{resumen.clasificacion.autoConfirmado}</span>
          </div>
          <div class="stat-card card">
            <span class="stat-label">Manual / sin clasificar</span>
            <span class="stat-value alerta">
              {resumen.clasificacion.manual + resumen.clasificacion.noEncontrado}
            </span>
          </div>
        </div>

        {#if resumen.resumenMensual.meses.length > 0}
          <section class="card">
            <h3>Nómina por unidad (mensual)</h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Unidad</th>
                    {#each resumen.resumenMensual.meses as mes}<th>{mes}</th>{/each}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {#each resumen.resumenMensual.porUnidad as fila}
                    <tr class:sin-clasificar-fila={fila.unidad === 'Sin clasificar'}>
                      <td><strong>{fila.unidad}</strong></td>
                      {#each resumen.resumenMensual.meses as mes}
                        <td>{formatearMoneda(fila.porMes[mes] ?? 0)}</td>
                      {/each}
                      <td><strong>{formatearMoneda(fila.total)}</strong></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {:else}
          <section class="card tabla-vacia-panel">
            <p>Importa <strong>Nómina Real 2026</strong> y pulsa <em>Sincronizar desde Nómina Real</em>.</p>
          </section>
        {/if}

        <section class="card">
          <div class="seccion-encabezado">
            <h3>Detalle de pagos</h3>
            {#if puedeEditar}
              <span class="hint-editable">La columna <strong>Unidad</strong> es editable en cada fila</span>
            {/if}
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Colaborador</th>
                  <th>Periodo</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th class="col-unidad">
                    Unidad
                    {#if puedeEditar}<span class="col-editar" title="Editable">✎</span>{/if}
                  </th>
                </tr>
              </thead>
              <tbody>
                {#if resumen.pagos.length === 0}
                  <tr><td colspan="6" class="tabla-vacia">Sin pagos registrados</td></tr>
                {:else}
                  {#each resumen.pagos as pago}
                    <tr class:sin-clasificar={pago.estadoClasificacion === 'no_encontrado'}>
                      <td>
                        <span class="badge-clasif {claseBadge(pago.estadoClasificacion)}">
                          {etiquetaEstado(pago.estadoClasificacion)}
                        </span>
                      </td>
                      <td>{pago.colaborador}</td>
                      <td>{pago.periodo}</td>
                      <td>{pago.concepto || '—'}</td>
                      <td>{formatearMoneda(pago.monto)}</td>
                      <td class="celda-unidad">
                        <select
                          class="select select-unidad"
                          class:select-editable={puedeEditar}
                          disabled={!puedeEditar || guardandoUnidad === pago._id}
                          value={pago.unidadClasificada === 'sin_clasificar' ? 'sin_clasificar' : pago.unidadClasificada}
                          onchange={(e) => {
                            const valor = e.currentTarget.value;
                            if (valor === 'sin_clasificar') return;
                            cambiarUnidadPago(pago, valor as UnidadPago);
                          }}
                        >
                          <option value="sin_clasificar" disabled={pago.unidadClasificada !== 'sin_clasificar'}>
                            Sin clasificar
                          </option>
                          <option value="Consulting">Consulting</option>
                          <option value="Technologies">Technologies</option>
                          <option value="Grupo">Grupo</option>
                        </select>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    {:else}
      <section class="card header-panel">
        <div>
          <h3>Catálogo de personas</h3>
          <p class="subtitulo">El campo <strong>tipo de nómina</strong> define cómo se clasifica cada pago (sin topes).</p>
        </div>
        {#if puedeEditar}<button class="btn btn-primary" onclick={abrirCrear}>Agregar</button>{/if}
      </section>

      <section class="card">
        <h4>Socios y colaboradores ({internos.length})</h4>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Tipo nómina</th>
                <th>Unidad base</th>
                <th>Notas</th>
                {#if puedeEditar}<th></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each internos as item}
                <tr>
                  <td><strong>{item.nombre}</strong></td>
                  <td>{etiquetaTipo(item.tipoRelacion)}</td>
                  <td>{etiquetaTipoNomina(item.tipoNomina)}</td>
                  <td>{item.unidadBase}</td>
                  <td>{item.notas || '—'}</td>
                  {#if puedeEditar}
                    <td><button class="link" onclick={() => abrirEditar(item)}>Editar</button></td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h4>Honorarios externos ({externos.length})</h4>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Tipo nómina</th><th>Unidad</th><th>Notas</th>{#if puedeEditar}<th></th>{/if}</tr>
            </thead>
            <tbody>
              {#each externos as item}
                <tr>
                  <td><strong>{item.nombre}</strong></td>
                  <td>{etiquetaTipoNomina(item.tipoNomina)}</td>
                  <td>{item.unidadBase}</td>
                  <td>{item.notas || '—'}</td>
                  {#if puedeEditar}
                    <td><button class="link" onclick={() => abrirEditar(item)}>Editar</button></td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </div>
{/if}

<Modal abierto={modalAbierto} titulo={modoEdicion ? 'Editar persona' : 'Nueva persona'} onCerrar={() => (modalAbierto = false)}>
  <div class="form-grid">
    <div class="form-group full">
      <label class="label" for="nom-nombre">Nombre</label>
      <input id="nom-nombre" class="input" bind:value={formNombre} />
    </div>
    <div class="form-group">
      <label class="label" for="nom-unidad">Unidad base</label>
      <select id="nom-unidad" class="select" bind:value={formUnidad} onchange={onCambioUnidadForm}>
        <option value="Consulting">Consulting</option>
        <option value="Technologies">Technologies</option>
        <option value="Grupo">Grupo</option>
      </select>
    </div>
    <div class="form-group">
      <label class="label" for="nom-tipo">Rol</label>
      <select id="nom-tipo" class="select" bind:value={formTipo} onchange={onCambioTipoForm}>
        <option value="socio">Socio</option>
        <option value="colaborador">Colaborador</option>
        <option value="honorarios_externos">Honorarios externos</option>
      </select>
    </div>
    <div class="form-group full">
      <label class="label" for="nom-tipo-nomina">Tipo de nómina</label>
      <select id="nom-tipo-nomina" class="select" bind:value={formTipoNomina}>
        <option value="honorarios_por_proyecto">Honorarios por proyecto (Consulting)</option>
        <option value="sueldo_y_comisiones">Sueldo y comisiones (Technologies)</option>
        <option value="honorarios_externos">Honorarios externos (Grupo)</option>
      </select>
    </div>
    <div class="form-group full">
      <label class="label" for="nom-notas">Notas</label>
      <input id="nom-notas" class="input" bind:value={formNotas} />
    </div>
  </div>
  <div class="modal-actions">
    <button class="btn btn-secondary" onclick={() => (modalAbierto = false)}>Cancelar</button>
    <button class="btn btn-primary" disabled={guardando} onclick={guardarColaborador}>
      {guardando ? 'Guardando...' : 'Guardar'}
    </button>
  </div>
</Modal>

<style>
  .modulo-contenido { display: flex; flex-direction: column; gap: 1rem; }
  .tabs { display: flex; gap: 0.5rem; }
  .tabs button { border: 1px solid var(--color-border); background: white; padding: 0.5rem 1rem; border-radius: 999px; cursor: pointer; }
  .tabs button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
  .acciones-panel { padding: 1rem; }
  .acciones { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 0.5rem; }
  .checkbox-label { display: flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
  .ayuda { font-size: 0.82rem; color: var(--color-text-muted); margin: 0; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
  .stat-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.25rem; font-weight: 700; color: var(--color-primary); }
  .stat-value.activo { color: var(--color-success); }
  .stat-value.alerta { color: var(--color-danger); }
  .card { padding: 1rem; }
  h3, h4 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .header-panel { display: flex; justify-content: space-between; align-items: flex-start; }
  .subtitulo { color: var(--color-text-muted); font-size: 0.82rem; margin-top: 0.25rem; }
  .badge-clasif { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 999px; font-weight: 600; white-space: nowrap; }
  .badge-clasif.confirmada { background: #dcfce7; color: #166534; }
  .badge-clasif.manual { background: #dbeafe; color: #1e40af; }
  .badge-clasif.sin-clasificar { background: #fee2e2; color: #991b1b; }
  tr.sin-clasificar, tr.sin-clasificar-fila { background: #fff7ed; }
  .seccion-encabezado { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1rem; margin-bottom: 0.75rem; }
  .seccion-encabezado h3 { margin-bottom: 0; }
  .hint-editable { font-size: 0.78rem; color: var(--color-text-muted); }
  .col-unidad { white-space: nowrap; }
  .col-editar { margin-left: 0.25rem; color: var(--color-primary); font-size: 0.75rem; }
  .celda-unidad { min-width: 9rem; }
  .select-unidad { font-size: 0.8rem; padding: 0.25rem 0.4rem; min-width: 8.5rem; width: 100%; }
  .select-unidad:not(.select-editable) { appearance: none; border: none; background: transparent; color: inherit; pointer-events: none; padding-left: 0; }
  .select-unidad.select-editable { border: 1px solid var(--color-border); border-radius: 6px; background: white; cursor: pointer; }
  .select-unidad.select-editable:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
  .tabla-vacia { text-align: center; color: var(--color-text-muted); padding: 1rem; }
  .tabla-vacia-panel { text-align: center; color: var(--color-text-muted); }
  .link { background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 0.8rem; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .form-grid .full { grid-column: 1 / -1; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  .estado { color: var(--color-text-muted); }
</style>
