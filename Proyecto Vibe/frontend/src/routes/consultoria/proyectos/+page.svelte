<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import {
    moneyMx,
    pctLabel,
    nombreRef,
    idRef,
    STATUS_PROYECTO_LABEL,
    TIPO_PROYECTO_LABEL,
    type ApiResponse,
    type ConsultoriaCliente,
    type ConsultoriaMeta,
    type ConsultoriaProyecto,
    type ConsultoriaPropuesta,
    type ConsultorRef,
    type ResumenProyectos,
    type StatusProyecto,
    type TipoProyecto,
    type RolProyecto,
  } from '$lib/types/consultoria';

  let puedeEditar = $derived(
    $auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor'
  );

  let meta = $state<ConsultoriaMeta | null>(null);
  let consultores = $state<ConsultorRef[]>([]);
  let clientes = $state<ConsultoriaCliente[]>([]);
  let propuestasGanadas = $state<ConsultoriaPropuesta[]>([]);
  let proyectos = $state<ConsultoriaProyecto[]>([]);
  let resumen = $state<ResumenProyectos | null>(null);

  let filtroConsultor = $state('');
  let filtroStatus = $state('');
  let filtroTipo = $state('');
  let vista = $state<'consultor' | 'cliente'>('consultor');

  let cargando = $state(false);
  let guardando = $state(false);
  let error = $state('');
  let mensaje = $state('');

  let modalAbierto = $state(false);
  let editId = $state<string | null>(null);
  let form = $state(formVacio());
  let notaRapida = $state('');

  const statusOrden: StatusProyecto[] = ['INICIANDO', 'EN_PROCESO', 'TERMINADO'];

  function formVacio() {
    return {
      consultorId: '',
      rol: 'LIDER' as RolProyecto,
      consultorCompartidoId: '',
      pctConsultorPrincipal: 1,
      pctConsultorCompartido: 0,
      clienteId: '',
      descripcion: '',
      tipo: 'CONSULTORIA' as TipoProyecto,
      status: 'INICIANDO' as StatusProyecto,
      propuestaId: '',
      fechaInicio: '',
      fechaFinEstimada: '',
      fechaFinReal: '',
      montoContratado: 0,
      pctIva: 0.16,
      notas: '',
      activo: true,
    };
  }

  function qs(): string {
    const p = new URLSearchParams();
    p.set('activos', 'true');
    if (filtroConsultor) p.set('consultorId', filtroConsultor);
    if (filtroStatus) p.set('status', filtroStatus);
    if (filtroTipo) p.set('tipo', filtroTipo);
    return p.toString();
  }

  async function cargarCatalogos() {
    const [m, c, cl, prop] = await Promise.all([
      api<ApiResponse<ConsultoriaMeta>>('/consultoria/meta'),
      api<ApiResponse<ConsultorRef[]>>('/consultoria/consultores?activos=true'),
      api<ApiResponse<ConsultoriaCliente[]>>('/consultoria/clientes?activos=true'),
      api<ApiResponse<ConsultoriaPropuesta[]>>('/consultoria/propuestas?status=GANADA'),
    ]);
    meta = m.data;
    consultores = c.data ?? [];
    clientes = cl.data ?? [];
    propuestasGanadas = prop.data ?? [];
  }

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const q = qs();
      const [lista, res] = await Promise.all([
        api<ApiResponse<ConsultoriaProyecto[]>>(`/consultoria/proyectos?${q}`),
        api<ApiResponse<ResumenProyectos>>(`/consultoria/proyectos/resumen?${q}`),
      ]);
      proyectos = lista.data ?? [];
      resumen = res.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar';
      proyectos = [];
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  function abrirNuevo() {
    editId = null;
    form = {
      ...formVacio(),
      consultorId: filtroConsultor || consultores[0]?._id || '',
    };
    notaRapida = '';
    modalAbierto = true;
  }

  function abrirEditar(p: ConsultoriaProyecto) {
    editId = p._id;
    form = {
      consultorId: idRef(p.consultorId),
      rol: p.rol,
      consultorCompartidoId: idRef(p.consultorCompartidoId),
      pctConsultorPrincipal: p.pctConsultorPrincipal,
      pctConsultorCompartido: p.pctConsultorCompartido,
      clienteId: idRef(p.clienteId),
      descripcion: p.descripcion,
      tipo: p.tipo,
      status: p.status,
      propuestaId: idRef(p.propuestaId),
      fechaInicio: p.fechaInicio ? String(p.fechaInicio).slice(0, 10) : '',
      fechaFinEstimada: p.fechaFinEstimada ? String(p.fechaFinEstimada).slice(0, 10) : '',
      fechaFinReal: p.fechaFinReal ? String(p.fechaFinReal).slice(0, 10) : '',
      montoContratado: p.montoContratado ?? 0,
      pctIva: p.pctIva ?? 0.16,
      notas: p.notas || '',
      activo: p.activo !== false,
    };
    notaRapida = '';
    modalAbierto = true;
  }

  function onRolChange() {
    if (form.rol === 'LIDER') {
      form.pctConsultorPrincipal = 1;
      form.pctConsultorCompartido = 0;
      form.consultorCompartidoId = '';
    } else if (form.pctConsultorPrincipal === 1) {
      form.pctConsultorPrincipal = 0.5;
      form.pctConsultorCompartido = 0.5;
    }
  }

  async function guardar() {
    guardando = true;
    error = '';
    mensaje = '';
    try {
      const body = {
        ...form,
        consultorCompartidoId: form.consultorCompartidoId || null,
        propuestaId: form.propuestaId || null,
        fechaInicio: form.fechaInicio || null,
        fechaFinEstimada: form.fechaFinEstimada || null,
        fechaFinReal: form.fechaFinReal || null,
        montoContratado: Number(form.montoContratado) || 0,
      };
      if (editId) {
        await api(`/consultoria/proyectos/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        if (notaRapida.trim()) {
          await api(`/consultoria/proyectos/${editId}/notas`, {
            method: 'POST',
            body: JSON.stringify({ nota: notaRapida.trim() }),
          });
        }
        mensaje = 'Proyecto actualizado';
      } else {
        const creado = await api<ApiResponse<ConsultoriaProyecto>>('/consultoria/proyectos', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (notaRapida.trim() && creado.data?._id) {
          await api(`/consultoria/proyectos/${creado.data._id}/notas`, {
            method: 'POST',
            body: JSON.stringify({ nota: notaRapida.trim() }),
          });
        }
        mensaje = 'Proyecto creado';
      }
      modalAbierto = false;
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar';
    } finally {
      guardando = false;
    }
  }

  async function cambiarStatus(id: string, status: StatusProyecto) {
    try {
      await api(`/consultoria/proyectos/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo cambiar status';
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este proyecto?')) return;
    try {
      await api(`/consultoria/proyectos/${id}`, { method: 'DELETE' });
      mensaje = 'Proyecto eliminado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo eliminar';
    }
  }

  async function seedOperacion() {
    if (!confirm('Cargar/actualizar extracto de proyectos de operación?')) return;
    try {
      const res = await api<ApiResponse<{ creadas: number; actualizadas: number; total: number }>>(
        '/consultoria/seed/proyectos-operacion',
        { method: 'POST', body: '{}' }
      );
      mensaje = `Seed: ${res.data.creadas} creadas, ${res.data.actualizadas} actualizadas`;
      await cargarCatalogos();
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Seed falló';
    }
  }

  function gruposPorConsultor() {
    const map = new Map<string, { nombre: string; items: ConsultoriaProyecto[] }>();
    for (const p of proyectos) {
      const id = idRef(p.consultorId);
      const nombre = nombreRef(p.consultorId);
      if (!map.has(id)) map.set(id, { nombre, items: [] });
      map.get(id)!.items.push(p);
    }
    return [...map.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'));
  }

  function gruposPorCliente() {
    const map = new Map<string, { nombre: string; items: ConsultoriaProyecto[] }>();
    for (const p of proyectos) {
      const id = idRef(p.clienteId);
      const nombre = nombreRef(p.clienteId);
      if (!map.has(id)) map.set(id, { nombre, items: [] });
      map.get(id)!.items.push(p);
    }
    return [...map.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'));
  }

  function fmtFecha(v: string | null | undefined) {
    if (!v) return '—';
    return String(v).slice(0, 10);
  }

  onMount(async () => {
    if (!puedeEditar) return;
    try {
      await cargarCatalogos();
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error inicial';
    }
  });
</script>

<svelte:head>
  <title>Proyectos — Consultoría — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Operación de proyectos</h1>
      <p>Consultoría (BWConsulting) — semáforo por status, % compartido configurable</p>
    </div>
    <div class="header-actions">
      <a href="/consultoria" class="btn btn-secondary">Inicio</a>
      <a href="/consultoria/propuestas" class="btn btn-secondary">Propuestas</a>
      {#if $auth.usuario?.rol === 'admin'}
        <button type="button" class="btn btn-secondary" onclick={seedOperacion}>Seed operación</button>
      {/if}
      <button type="button" class="btn btn-primary" onclick={abrirNuevo}>+ Proyecto</button>
    </div>
  </header>

  {#if !puedeEditar}
    <p class="estado">Requiere rol admin o editor.</p>
  {:else}
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
    {#if error}<div class="alert alert-error">{error}</div>{/if}

    {#if resumen}
      <section class="kpi-row">
        <div class="kpi"><span class="muted">Activos</span><strong>{resumen.total}</strong></div>
        <div class="kpi"
          ><span class="muted">Iniciando</span><strong>{resumen.porStatus.INICIANDO || 0}</strong></div
        >
        <div class="kpi"
          ><span class="muted">En proceso</span><strong>{resumen.porStatus.EN_PROCESO || 0}</strong
          ></div
        >
        <div class="kpi"
          ><span class="muted">Terminados</span><strong>{resumen.porStatus.TERMINADO || 0}</strong
          ></div
        >
        <div class="kpi"
          ><span class="muted">Monto contratado</span><strong
            >{moneyMx(resumen.montoContratadoTotal)}</strong
          ></div
        >
      </section>
    {/if}

    <section class="card filtros">
      <div class="form-group">
        <label class="label" for="f-c">Consultor</label>
        <select id="f-c" class="select" bind:value={filtroConsultor}>
          <option value="">Todos</option>
          {#each consultores as c}
            <option value={c._id}>{c.nombre}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="f-s">Status</label>
        <select id="f-s" class="select" bind:value={filtroStatus}>
          <option value="">Todos</option>
          {#each statusOrden as s}
            <option value={s}>{STATUS_PROYECTO_LABEL[s]}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="f-t">Tipo</label>
        <select id="f-t" class="select" bind:value={filtroTipo}>
          <option value="">Todos</option>
          {#each meta?.enums.tiposProyecto ?? [] as t}
            <option value={t}>{TIPO_PROYECTO_LABEL[t] ?? t}</option>
          {/each}
        </select>
      </div>
      <button type="button" class="btn btn-secondary" onclick={cargar}>Buscar</button>
      <div class="vista-toggle">
        <button
          type="button"
          class="btn"
          class:btn-primary={vista === 'consultor'}
          class:btn-secondary={vista !== 'consultor'}
          onclick={() => (vista = 'consultor')}>Por consultor</button
        >
        <button
          type="button"
          class="btn"
          class:btn-primary={vista === 'cliente'}
          class:btn-secondary={vista !== 'cliente'}
          onclick={() => (vista = 'cliente')}>Por cliente</button
        >
      </div>
    </section>

    {#if cargando}
      <p class="estado">Cargando…</p>
    {:else}
      {#each vista === 'consultor' ? gruposPorConsultor() : gruposPorCliente() as [gid, g]}
        <section class="grupo">
          <h2>
            {g.nombre}
            <span class="muted">({g.items.length})</span>
            {#if vista === 'consultor' && resumen}
              {@const rc = resumen.porConsultor.find((x) => x.consultorId === gid)}
              {#if rc}
                <span class="chips">
                  <span class="chip chip-INICIANDO">{rc.porStatus.INICIANDO || 0} iniciando</span>
                  <span class="chip chip-EN_PROCESO">{rc.porStatus.EN_PROCESO || 0} proceso</span>
                  <span class="chip chip-TERMINADO">{rc.porStatus.TERMINADO || 0} terminado</span>
                </span>
              {/if}
            {/if}
          </h2>
          <div class="table-wrap">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Cliente / descripción</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Fechas</th>
                  <th>Monto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each g.items as p}
                  <tr>
                    <td>
                      {p.rol}
                      {#if p.rol === 'COMPARTIDO'}
                        <div class="muted">
                          + {nombreRef(p.consultorCompartidoId)} ({pctLabel(p.pctConsultorPrincipal)} /
                          {pctLabel(p.pctConsultorCompartido)})
                        </div>
                      {/if}
                    </td>
                    <td>
                      <strong>{nombreRef(p.clienteId)}</strong>
                      <div>{p.descripcion}</div>
                      {#if vista === 'cliente'}
                        <div class="muted">Resp: {nombreRef(p.consultorId)}</div>
                      {/if}
                    </td>
                    <td>{TIPO_PROYECTO_LABEL[p.tipo] ?? p.tipo}</td>
                    <td>
                      <span class={`badge badge-${p.status}`}>{STATUS_PROYECTO_LABEL[p.status]}</span>
                    </td>
                    <td class="muted">
                      {fmtFecha(p.fechaInicio)} → {fmtFecha(p.fechaFinEstimada)}
                      {#if p.fechaFinReal}
                        <div>Real: {fmtFecha(p.fechaFinReal)}</div>
                      {/if}
                    </td>
                    <td class="num">{moneyMx(p.montoContratado)}</td>
                    <td class="acciones">
                      <select
                        class="select sm"
                        value={p.status}
                        onchange={(e) =>
                          cambiarStatus(
                            p._id,
                            (e.currentTarget as HTMLSelectElement).value as StatusProyecto
                          )}
                      >
                        {#each statusOrden as s}
                          <option value={s}>{STATUS_PROYECTO_LABEL[s]}</option>
                        {/each}
                      </select>
                      <button type="button" class="link" onclick={() => abrirEditar(p)}>Editar</button>
                      <button type="button" class="link danger" onclick={() => eliminar(p._id)}
                        >✕</button
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {:else}
        <p class="estado">Sin proyectos. Usa seed o + Proyecto.</p>
      {/each}
    {/if}
  {/if}
</div>

{#if modalAbierto}
  <div class="modal-backdrop" role="presentation" onclick={() => (modalAbierto = false)}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (modalAbierto = false)}
    >
      <h2>{editId ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
      <div class="grid-2">
        <div class="form-group">
          <label class="label" for="m-cons">Consultor responsable</label>
          <select id="m-cons" class="select" bind:value={form.consultorId}>
            {#each consultores as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-rol">Rol</label>
          <select id="m-rol" class="select" bind:value={form.rol} onchange={onRolChange}>
            <option value="LIDER">LÍDER</option>
            <option value="COMPARTIDO">COMPARTIDO</option>
          </select>
        </div>
        {#if form.rol === 'COMPARTIDO'}
          <div class="form-group">
            <label class="label" for="m-comp">Consultor compartido</label>
            <select id="m-comp" class="select" bind:value={form.consultorCompartidoId}>
              <option value="">—</option>
              {#each consultores as c}
                <option value={c._id}>{c.nombre}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label class="label" for="m-pct">% principal / compartido</label>
            <div class="inline-row">
              <input
                id="m-pct"
                class="input"
                type="number"
                step="0.01"
                min="0"
                max="1"
                bind:value={form.pctConsultorPrincipal}
                oninput={() =>
                  (form.pctConsultorCompartido = Math.round((1 - Number(form.pctConsultorPrincipal)) * 100) / 100)}
              />
              <input
                class="input"
                type="number"
                step="0.01"
                min="0"
                max="1"
                bind:value={form.pctConsultorCompartido}
              />
            </div>
          </div>
        {/if}
        <div class="form-group">
          <label class="label" for="m-cli">Cliente</label>
          <select id="m-cli" class="select" bind:value={form.clienteId}>
            <option value="">—</option>
            {#each clientes as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-tipo">Tipo</label>
          <select id="m-tipo" class="select" bind:value={form.tipo}>
            {#each meta?.enums.tiposProyecto ?? [] as t}
              <option value={t}>{TIPO_PROYECTO_LABEL[t] ?? t}</option>
            {/each}
          </select>
        </div>
        <div class="form-group full">
          <label class="label" for="m-desc">Descripción</label>
          <input id="m-desc" class="input" bind:value={form.descripcion} />
        </div>
        <div class="form-group">
          <label class="label" for="m-st">Status</label>
          <select id="m-st" class="select" bind:value={form.status}>
            {#each statusOrden as s}
              <option value={s}>{STATUS_PROYECTO_LABEL[s]}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-prop">Ligar propuesta</label>
          <select id="m-prop" class="select" bind:value={form.propuestaId}>
            <option value="">— Sin ligar —</option>
            {#each propuestasGanadas as pr}
              <option value={pr._id}
                >#{pr.numeroConsecutivo} {nombreRef(pr.clienteId)} ({pr.anio}-{pr.mes})</option
              >
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-fi">Inicio</label>
          <input id="m-fi" class="input" type="date" bind:value={form.fechaInicio} />
        </div>
        <div class="form-group">
          <label class="label" for="m-ff">Fin estimado</label>
          <input id="m-ff" class="input" type="date" bind:value={form.fechaFinEstimada} />
        </div>
        <div class="form-group">
          <label class="label" for="m-monto">Monto contratado (sin IVA)</label>
          <input
            id="m-monto"
            class="input"
            type="number"
            step="0.01"
            min="0"
            bind:value={form.montoContratado}
          />
        </div>
        <div class="form-group full">
          <label class="label" for="m-nota">Agregar nota</label>
          <input id="m-nota" class="input" bind:value={notaRapida} placeholder="Nota con fecha…" />
        </div>
        {#if form.notas}
          <div class="form-group full">
            <label class="label">Notas previas</label>
            <pre class="notas">{form.notas}</pre>
          </div>
        {/if}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={() => (modalAbierto = false)}
          >Cancelar</button
        >
        <button type="button" class="btn btn-primary" disabled={guardando} onclick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  </div>
{/if}

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
  .kpi-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .kpi {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    min-width: 7rem;
  }
  .kpi .muted {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
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
  .vista-toggle {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }
  .grupo {
    margin-bottom: 1.5rem;
  }
  .grupo h2 {
    font-size: 1.05rem;
    margin: 0 0 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 0.35rem;
  }
  .chip {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
  }
  .chip-INICIANDO,
  .badge-INICIANDO {
    background: #fef3c7;
    color: #92400e;
  }
  .chip-EN_PROCESO,
  .badge-EN_PROCESO {
    background: #dbeafe;
    color: #1e40af;
  }
  .chip-TERMINADO,
  .badge-TERMINADO {
    background: #dcfce7;
    color: #166534;
  }
  .badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    font-weight: 600;
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
    vertical-align: top;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: #64748b;
    font-size: 0.8rem;
  }
  .acciones {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .link {
    background: none;
    border: none;
    color: #1d4ed8;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .link.danger {
    color: #b91c1c;
  }
  .select.sm {
    font-size: 0.75rem;
    padding: 0.15rem;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 2rem 1rem;
    z-index: 50;
    overflow-y: auto;
  }
  .modal {
    background: #fff;
    border-radius: 10px;
    padding: 1.25rem;
    width: min(640px, 100%);
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .form-group.full {
    grid-column: 1 / -1;
  }
  .inline-row {
    display: flex;
    gap: 0.5rem;
  }
  .notas {
    white-space: pre-wrap;
    font-size: 0.8rem;
    background: #f8fafc;
    padding: 0.5rem;
    border-radius: 6px;
    margin: 0;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .estado {
    color: #64748b;
  }
  @media (max-width: 720px) {
    .grid-2 {
      grid-template-columns: 1fr;
    }
  }
</style>
