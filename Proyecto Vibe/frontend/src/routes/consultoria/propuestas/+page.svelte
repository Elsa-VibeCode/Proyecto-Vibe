<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import {
    MESES_ES,
    STATUS_LABEL,
    moneyMx,
    pctLabel,
    nombreRef,
    idRef,
    labelUbicacion,
    labelProceso,
    type ApiResponse,
    type ConsultoriaCliente,
    type ConsultoriaMeta,
    type ConsultoriaPropuesta,
    type ConsultorRef,
    type ResumenPropuestas,
    type StatusPropuesta,
    type ProcesoPropuesta,
    type UbicacionConsultoria,
    type TipoClienteConsultoria,
  } from '$lib/types/consultoria';

  let puedeEditar = $derived(
    $auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor'
  );

  let meta = $state<ConsultoriaMeta | null>(null);
  let consultores = $state<ConsultorRef[]>([]);
  let clientes = $state<ConsultoriaCliente[]>([]);
  let propuestas = $state<ConsultoriaPropuesta[]>([]);
  let resumen = $state<ResumenPropuestas | null>(null);

  let anio = $state(2025);
  let mes = $state(0); // 0 = todos
  let filtroUbicacion = $state('');
  let filtroStatus = $state('');
  let filtroLider = $state('');
  let vista = $state<'tabla' | 'kanban'>('tabla');

  let cargando = $state(false);
  let guardando = $state(false);
  let error = $state('');
  let mensaje = $state('');

  let modalAbierto = $state(false);
  let editId = $state<string | null>(null);
  let form = $state(formVacio());
  let nuevoClienteNombre = $state('');
  let crearClienteInline = $state(false);

  function formVacio() {
    return {
      anio: 2025,
      mes: 1,
      ubicacion: 'CUU' as UbicacionConsultoria,
      liderId: '',
      liderSecundarioId: '',
      finderId: '',
      clienteId: '',
      tiempoEstimado: '',
      proceso: 'ESTRATEGIA' as ProcesoPropuesta,
      procesoDetalle: '',
      monto: '' as string | number,
      pctIva: 0.16,
      status: 'PROSPECTO' as StatusPropuesta,
      notas: '',
    };
  }

  const statusOrden: StatusPropuesta[] = ['PROSPECTO', 'NEGOCIACION', 'GANADA', 'PERDIDA'];

  function qsFiltros(): string {
    const p = new URLSearchParams();
    if (anio) p.set('anio', String(anio));
    if (mes) p.set('mes', String(mes));
    if (filtroUbicacion) p.set('ubicacion', filtroUbicacion);
    if (filtroStatus) p.set('status', filtroStatus);
    if (filtroLider) p.set('liderId', filtroLider);
    return p.toString();
  }

  async function cargarCatalogos() {
    const [m, c, cl] = await Promise.all([
      api<ApiResponse<ConsultoriaMeta>>('/consultoria/meta'),
      api<ApiResponse<ConsultorRef[]>>('/consultoria/consultores?activos=true'),
      api<ApiResponse<ConsultoriaCliente[]>>('/consultoria/clientes?activos=true'),
    ]);
    meta = m.data;
    consultores = c.data ?? [];
    clientes = cl.data ?? [];
  }

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const q = qsFiltros();
      const [lista, res] = await Promise.all([
        api<ApiResponse<ConsultoriaPropuesta[]>>(`/consultoria/propuestas?${q}`),
        api<ApiResponse<ResumenPropuestas>>(`/consultoria/propuestas/resumen?${q}`),
      ]);
      propuestas = lista.data ?? [];
      resumen = res.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar';
      propuestas = [];
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  function abrirNueva() {
    editId = null;
    form = { ...formVacio(), anio, mes: mes || 1, liderId: consultores[0]?._id || '' };
    crearClienteInline = false;
    nuevoClienteNombre = '';
    modalAbierto = true;
  }

  function abrirEditar(p: ConsultoriaPropuesta) {
    editId = p._id;
    form = {
      anio: p.anio,
      mes: p.mes,
      ubicacion: p.ubicacion,
      liderId: idRef(p.liderId),
      liderSecundarioId: idRef(p.liderSecundarioId),
      finderId: idRef(p.finderId),
      clienteId: idRef(p.clienteId),
      tiempoEstimado: p.tiempoEstimado || '',
      proceso: p.proceso,
      procesoDetalle: p.procesoDetalle || '',
      monto: p.monto == null ? '' : p.monto,
      pctIva: p.pctIva ?? 0.16,
      status: p.status,
      notas: p.notas || '',
    };
    crearClienteInline = false;
    modalAbierto = true;
  }

  async function guardarClienteInline() {
    const nombre = nuevoClienteNombre.trim();
    if (!nombre) return;
    const res = await api<ApiResponse<ConsultoriaCliente>>('/consultoria/clientes', {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        ubicacion: form.ubicacion,
        tipoCliente: 'NUEVO' as TipoClienteConsultoria,
      }),
    });
    clientes = [...clientes, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    form.clienteId = res.data._id;
    crearClienteInline = false;
    nuevoClienteNombre = '';
  }

  async function guardar() {
    guardando = true;
    error = '';
    mensaje = '';
    try {
      if (crearClienteInline && nuevoClienteNombre.trim()) {
        await guardarClienteInline();
      }
      if (!form.clienteId) throw new Error('Selecciona o crea un cliente');
      if (!form.liderId) throw new Error('Selecciona líder');

      const body = {
        anio: Number(form.anio),
        mes: Number(form.mes),
        ubicacion: form.ubicacion,
        liderId: form.liderId,
        liderSecundarioId: form.liderSecundarioId || null,
        finderId: form.finderId || null,
        clienteId: form.clienteId,
        tiempoEstimado: form.tiempoEstimado,
        proceso: form.proceso,
        procesoDetalle: form.procesoDetalle,
        monto: form.monto === '' ? null : Number(form.monto),
        pctIva: Number(form.pctIva),
        status: form.status,
        notas: form.notas,
      };

      if (editId) {
        await api(`/consultoria/propuestas/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        mensaje = 'Propuesta actualizada';
      } else {
        await api('/consultoria/propuestas', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        mensaje = 'Propuesta creada';
      }
      modalAbierto = false;
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar';
    } finally {
      guardando = false;
    }
  }

  async function cambiarStatus(id: string, status: StatusPropuesta) {
    try {
      await api(`/consultoria/propuestas/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo cambiar status';
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta propuesta?')) return;
    try {
      await api(`/consultoria/propuestas/${id}`, { method: 'DELETE' });
      mensaje = 'Propuesta eliminada';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo eliminar';
    }
  }

  async function seedEnero() {
    if (!confirm('Cargar/actualizar propuestas de enero 2025 del Excel BWS?')) return;
    try {
      const res = await api<ApiResponse<{ creadas: number; actualizadas: number; total: number }>>(
        '/consultoria/seed/propuestas-enero-2025',
        { method: 'POST', body: '{}' }
      );
      mensaje = `Seed: ${res.data.creadas} creadas, ${res.data.actualizadas} actualizadas`;
      await cargarCatalogos();
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Seed falló';
    }
  }

  function porStatus(s: StatusPropuesta) {
    return propuestas.filter((p) => p.status === s);
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
  <title>Propuestas — Consultoría — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Pipeline de propuestas</h1>
      <p>Consultoría (BWConsulting) — montos sin IVA</p>
    </div>
    <div class="header-actions">
      <a href="/consultoria" class="btn btn-secondary">Inicio</a>
      {#if $auth.usuario?.rol === 'admin'}
        <button type="button" class="btn btn-secondary" onclick={seedEnero}>Seed ene 2025</button>
      {/if}
      <button type="button" class="btn btn-primary" onclick={abrirNueva}>+ Propuesta</button>
    </div>
  </header>

  {#if !puedeEditar}
    <p class="estado">Requiere rol admin o editor.</p>
  {:else}
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
    {#if error}<div class="alert alert-error">{error}</div>{/if}

    {#if resumen}
      <section class="kpi-row">
        <div class="kpi"><span class="muted">Propuestas</span><strong>{resumen.total}</strong></div>
        <div class="kpi"><span class="muted">Monto cotizado</span><strong>{moneyMx(resumen.montoTotal)}</strong></div>
        <div class="kpi"><span class="muted">% Ganadas</span><strong>{pctLabel(resumen.pctGanadas)}</strong></div>
        <div class="kpi"><span class="muted">% Nuevos</span><strong>{pctLabel(resumen.pctNuevos)}</strong></div>
        <div class="kpi"><span class="muted">% Recurrentes</span><strong>{pctLabel(resumen.pctRecurrentes)}</strong></div>
      </section>
    {/if}

    <section class="card filtros">
      <div class="form-group">
        <label class="label" for="f-anio">Año</label>
        <input id="f-anio" class="input" type="number" bind:value={anio} min="2020" max="2100" />
      </div>
      <div class="form-group">
        <label class="label" for="f-mes">Mes</label>
        <select id="f-mes" class="select" bind:value={mes}>
          <option value={0}>Todos</option>
          {#each MESES_ES.slice(1) as nombre, i}
            <option value={i + 1}>{nombre}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="f-ubi">Ubicación</label>
        <select id="f-ubi" class="select" bind:value={filtroUbicacion}>
          <option value="">Todas</option>
          {#each meta?.enums.ubicaciones ?? [] as u}
            <option value={u}>{labelUbicacion(u)}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="f-st">Status</label>
        <select id="f-st" class="select" bind:value={filtroStatus}>
          <option value="">Todos</option>
          {#each statusOrden as s}
            <option value={s}>{STATUS_LABEL[s]}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="f-lider">Líder</label>
        <select id="f-lider" class="select" bind:value={filtroLider}>
          <option value="">Todos</option>
          {#each consultores as c}
            <option value={c._id}>{c.nombre}</option>
          {/each}
        </select>
      </div>
      <button type="button" class="btn btn-secondary" onclick={cargar}>Buscar</button>
      <div class="vista-toggle">
        <button
          type="button"
          class="btn"
          class:btn-primary={vista === 'tabla'}
          class:btn-secondary={vista !== 'tabla'}
          onclick={() => (vista = 'tabla')}>Tabla</button
        >
        <button
          type="button"
          class="btn"
          class:btn-primary={vista === 'kanban'}
          class:btn-secondary={vista !== 'kanban'}
          onclick={() => (vista = 'kanban')}>Kanban</button
        >
      </div>
    </section>

    {#if cargando}
      <p class="estado">Cargando…</p>
    {:else if vista === 'tabla'}
      <div class="table-wrap">
        <table class="tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Mes</th>
              <th>Ubicación</th>
              <th>Cliente</th>
              <th>Líder</th>
              <th>Finder</th>
              <th>Proceso</th>
              <th>Tiempo</th>
              <th>Monto</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each propuestas as p}
              <tr>
                <td>{p.numeroConsecutivo}</td>
                <td>{MESES_ES[p.mes]} {p.anio}</td>
                <td>{labelUbicacion(p.ubicacion)}</td>
                <td>
                  {nombreRef(p.clienteId)}
                  {#if typeof p.clienteId === 'object' && p.clienteId.tipoCliente}
                    <span class="tag">{p.clienteId.tipoCliente}</span>
                  {/if}
                </td>
                <td>
                  {nombreRef(p.liderId)}
                  {#if p.liderSecundarioId}
                    <span class="muted"> / {nombreRef(p.liderSecundarioId)}</span>
                  {/if}
                </td>
                <td>{nombreRef(p.finderId)}</td>
                <td>
                  {labelProceso(p.proceso)}
                  {#if p.procesoDetalle}<div class="muted">{p.procesoDetalle}</div>{/if}
                </td>
                <td>{p.tiempoEstimado || '—'}</td>
                <td class="num">{moneyMx(p.monto)}</td>
                <td><span class={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                <td class="acciones">
                  <button type="button" class="link" onclick={() => abrirEditar(p)}>Editar</button>
                  <button type="button" class="link danger" onclick={() => eliminar(p._id)}
                    >Eliminar</button
                  >
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="11" class="estado">Sin propuestas para estos filtros.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if resumen}
        <section class="card desgloses">
          <div>
            <h3>Por geografía</h3>
            <ul>
              {#each Object.entries(resumen.porUbicacion) as [k, v]}
                <li><span>{labelUbicacion(k)}</span><strong>{v}</strong></li>
              {/each}
            </ul>
          </div>
          <div>
            <h3>Por proceso</h3>
            <ul>
              {#each Object.entries(resumen.porProceso) as [k, v]}
                <li><span>{labelProceso(k)}</span><strong>{v}</strong></li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}
    {:else}
      <div class="kanban">
        {#each statusOrden as s}
          <div class="col">
            <h3>{STATUS_LABEL[s]} <span class="muted">({porStatus(s).length})</span></h3>
            {#each porStatus(s) as p}
              <article class="card-k">
                <header>
                  <strong>#{p.numeroConsecutivo} {nombreRef(p.clienteId)}</strong>
                  <span class="muted">{labelUbicacion(p.ubicacion)}</span>
                </header>
                <p>{labelProceso(p.proceso)} · {nombreRef(p.liderId)}</p>
                <p class="num">{moneyMx(p.monto)}</p>
                <div class="acciones">
                  <button type="button" class="link" onclick={() => abrirEditar(p)}>Editar</button>
                  <select
                    class="select sm"
                    value={p.status}
                    onchange={(e) =>
                      cambiarStatus(p._id, (e.currentTarget as HTMLSelectElement).value as StatusPropuesta)}
                  >
                    {#each statusOrden as st}
                      <option value={st}>{STATUS_LABEL[st]}</option>
                    {/each}
                  </select>
                </div>
              </article>
            {:else}
              <p class="estado">Vacío</p>
            {/each}
          </div>
        {/each}
      </div>
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
      <h2>{editId ? 'Editar propuesta' : 'Nueva propuesta'}</h2>
      <div class="grid-2">
        <div class="form-group">
          <label class="label" for="m-anio">Año</label>
          <input id="m-anio" class="input" type="number" bind:value={form.anio} />
        </div>
        <div class="form-group">
          <label class="label" for="m-mes">Mes</label>
          <select id="m-mes" class="select" bind:value={form.mes}>
            {#each MESES_ES.slice(1) as nombre, i}
              <option value={i + 1}>{nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-ubi">Ubicación</label>
          <select id="m-ubi" class="select" bind:value={form.ubicacion}>
            {#each meta?.enums.ubicaciones ?? [] as u}
              <option value={u}>{labelUbicacion(u)}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-st">Status</label>
          <select id="m-st" class="select" bind:value={form.status}>
            {#each statusOrden as s}
              <option value={s}>{STATUS_LABEL[s]}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-lider">Líder</label>
          <select id="m-lider" class="select" bind:value={form.liderId}>
            {#each consultores as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-lider2">Líder 2 (opcional)</label>
          <select id="m-lider2" class="select" bind:value={form.liderSecundarioId}>
            <option value="">—</option>
            {#each consultores as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-finder">Finder</label>
          <select id="m-finder" class="select" bind:value={form.finderId}>
            <option value="">N/A</option>
            {#each consultores as c}
              <option value={c._id}>{c.nombre}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="m-proc">Proceso</label>
          <select id="m-proc" class="select" bind:value={form.proceso}>
            {#each meta?.enums.procesos ?? [] as p}
              <option value={p}>{labelProceso(p)}</option>
            {/each}
          </select>
        </div>
        <div class="form-group full">
          <label class="label" for="m-cli">Cliente</label>
          {#if crearClienteInline}
            <div class="inline-row">
              <input
                id="m-cli"
                class="input"
                placeholder="Nombre del cliente"
                bind:value={nuevoClienteNombre}
              />
              <button type="button" class="btn btn-secondary" onclick={guardarClienteInline}
                >Crear</button
              >
              <button type="button" class="btn btn-ghost" onclick={() => (crearClienteInline = false)}
                >Cancelar</button
              >
            </div>
          {:else}
            <div class="inline-row">
              <select id="m-cli" class="select" bind:value={form.clienteId}>
                <option value="">— Selecciona —</option>
                {#each clientes as c}
                  <option value={c._id}>{c.nombre}</option>
                {/each}
              </select>
              <button type="button" class="btn btn-secondary" onclick={() => (crearClienteInline = true)}
                >+ Nuevo</button
              >
            </div>
          {/if}
        </div>
        <div class="form-group">
          <label class="label" for="m-tiempo">Tiempo estimado</label>
          <input id="m-tiempo" class="input" bind:value={form.tiempoEstimado} placeholder="2 días, TBD…" />
        </div>
        <div class="form-group">
          <label class="label" for="m-monto">Monto (sin IVA)</label>
          <input id="m-monto" class="input" type="number" step="0.01" min="0" bind:value={form.monto} />
        </div>
        <div class="form-group full">
          <label class="label" for="m-det">Detalle proceso</label>
          <input id="m-det" class="input" bind:value={form.procesoDetalle} />
        </div>
        <div class="form-group full">
          <label class="label" for="m-notas">Notas</label>
          <input id="m-notas" class="input" bind:value={form.notas} />
        </div>
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
    min-width: 8rem;
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
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .form-group.full {
    grid-column: 1 / -1;
  }
  .vista-toggle {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
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
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: #64748b;
    font-size: 0.8rem;
  }
  .tag {
    font-size: 0.65rem;
    background: #e2e8f0;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    margin-left: 0.25rem;
  }
  .badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .badge-PROSPECTO {
    background: #fef3c7;
    color: #92400e;
  }
  .badge-NEGOCIACION {
    background: #dbeafe;
    color: #1e40af;
  }
  .badge-GANADA {
    background: #dcfce7;
    color: #166534;
  }
  .badge-PERDIDA {
    background: #fee2e2;
    color: #991b1b;
  }
  .acciones {
    display: flex;
    gap: 0.5rem;
    align-items: center;
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
  .desgloses {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .desgloses ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .desgloses li {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .kanban {
    display: grid;
    grid-template-columns: repeat(4, minmax(180px, 1fr));
    gap: 0.75rem;
    overflow-x: auto;
  }
  .col {
    background: #f8fafc;
    border-radius: 8px;
    padding: 0.5rem;
    min-height: 12rem;
  }
  .col h3 {
    font-size: 0.9rem;
    margin: 0.25rem 0 0.5rem;
  }
  .card-k {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 0.6rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }
  .card-k header {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-bottom: 0.35rem;
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
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .inline-row {
    display: flex;
    gap: 0.5rem;
  }
  .inline-row .select,
  .inline-row .input {
    flex: 1;
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
    .grid-2,
    .desgloses,
    .kanban {
      grid-template-columns: 1fr;
    }
  }
</style>
