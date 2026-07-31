<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import {
    MESES_ES,
    moneyMx,
    pctLabel,
    nombreRef,
    idRef,
    type ApiResponse,
    type ConsultoriaProyecto,
  } from '$lib/types/consultoria';

  interface Conciliacion {
    sumaDetalle: number;
    ingresoReal: number;
    cuadra: boolean;
    diferencia: number;
  }

  interface IngresoMensual {
    _id: string;
    anio: number;
    mes: number;
    facturacion: number;
    ingresoReal: number;
    meta: number;
    cerrado: boolean;
    esHistoricoAnual?: boolean;
    notas?: string;
    cumplimientoMes: number | null;
    ingresoAcumulado: number;
    metaAcumulada: number;
    cumplimientoAcumulado: number | null;
    conciliacion: Conciliacion;
    formula?: Record<string, string>;
    snapshot?: Record<string, unknown> | null;
  }

  interface Detalle {
    _id: string;
    proyectoId: string | { _id: string; descripcion?: string; consultorId?: { nombre: string }; clienteId?: { nombre: string } };
    montoFacturado: number;
    montoCobrado: number;
    folio?: string;
    facturaId?: { noFactura?: string; subtotal?: number } | null;
    notas?: string;
  }

  interface Nomina {
    montoNomina: number;
    ingresosFijos: number;
    gap: number;
    notas?: string;
    formula?: { gap: string };
  }

  interface MesPack {
    mensual: IngresoMensual;
    detalle: Detalle[];
    nomina: Nomina | null;
    egresos: {
      cantidad: number;
      total: number;
      subtotal: number;
      enlace: string;
      formula?: Record<string, string>;
    };
    facturasConciliacion: {
      cantidad: number;
      subtotalSinIva: number;
      cobradoAproxSinIva: number;
      formula?: Record<string, string>;
    };
  }

  interface Comparativo {
    anios: number[];
    series: { anio: number; total: number; esHistorico: boolean; porMes: number[] }[];
  }

  let puedeEditar = $derived(
    $auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor'
  );

  let anio = $state(new Date().getFullYear());
  let mes = $state(new Date().getMonth() + 1);
  let pack = $state<MesPack | null>(null);
  let anioLista = $state<IngresoMensual[]>([]);
  let comparativo = $state<Comparativo | null>(null);
  let proyectos = $state<ConsultoriaProyecto[]>([]);

  let facturacion = $state(0);
  let ingresoReal = $state(0);
  let meta = $state(0);
  let notasMes = $state('');
  let montoNomina = $state(0);
  let ingresosFijos = $state(0);

  let detalleForm = $state({
    proyectoId: '',
    montoFacturado: 0,
    montoCobrado: 0,
    folio: '',
    notas: '',
  });

  let cargando = $state(false);
  let guardando = $state(false);
  let error = $state('');
  let mensaje = $state('');
  let mesExpandido = $state(true);

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const [mesRes, lista, comp, proy] = await Promise.all([
        api<ApiResponse<MesPack>>(`/consultoria/ingresos/${anio}/${mes}`),
        api<ApiResponse<IngresoMensual[]>>(`/consultoria/ingresos?anio=${anio}`),
        api<ApiResponse<Comparativo>>(`/consultoria/ingresos/comparativo?anio=${anio}`),
        api<ApiResponse<ConsultoriaProyecto[]>>('/consultoria/proyectos?activos=true'),
      ]);
      pack = mesRes.data;
      anioLista = lista.data ?? [];
      comparativo = comp.data;
      proyectos = proy.data ?? [];
      if (pack?.mensual) {
        facturacion = pack.mensual.facturacion;
        ingresoReal = pack.mensual.ingresoReal;
        meta = pack.mensual.meta;
        notasMes = pack.mensual.notas || '';
      }
      if (pack?.nomina) {
        montoNomina = pack.nomina.montoNomina;
        ingresosFijos = pack.nomina.ingresosFijos;
      } else {
        montoNomina = 0;
        ingresosFijos = 0;
      }
      if (!detalleForm.proyectoId && proyectos[0]) {
        detalleForm.proyectoId = proyectos[0]._id;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar';
      pack = null;
    } finally {
      cargando = false;
    }
  }

  async function guardarMes(opts: { forzar?: boolean; sync?: boolean } = {}) {
    guardando = true;
    error = '';
    mensaje = '';
    try {
      let justificacion = '';
      if (opts.forzar) {
        justificacion = prompt('Justificación del descuadre (obligatoria):') || '';
        if (!justificacion.trim()) {
          error = 'Justificación requerida';
          return;
        }
      }
      const body: Record<string, unknown> = {
        facturacion: Number(facturacion),
        ingresoReal: Number(ingresoReal),
        meta: Number(meta),
        notas: notasMes,
      };
      if (opts.forzar) {
        body.forzarDescuadre = true;
        body.justificacion = justificacion;
      }
      if (opts.sync) body.sincronizarDesdeDetalle = true;

      await api(`/consultoria/ingresos/${anio}/${mes}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      mensaje = opts.sync ? 'Sincronizado desde detalle' : 'Mes guardado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar';
    } finally {
      guardando = false;
    }
  }

  async function syncDetalle() {
    guardando = true;
    error = '';
    try {
      await api(`/consultoria/ingresos/${anio}/${mes}/sincronizar`, {
        method: 'POST',
        body: '{}',
      });
      mensaje = 'Facturación e ingreso real = suma del detalle';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al sincronizar';
    } finally {
      guardando = false;
    }
  }

  async function cerrar() {
    if (!confirm(`¿Cerrar ${MESES_ES[mes]} ${anio}? Quedará congelado.`)) return;
    try {
      await api(`/consultoria/ingresos/${anio}/${mes}/cerrar`, { method: 'POST', body: '{}' });
      mensaje = 'Mes cerrado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo cerrar';
    }
  }

  async function reabrir() {
    const just = prompt('Justificación para reabrir (obligatoria):');
    if (!just?.trim()) return;
    try {
      await api(`/consultoria/ingresos/${anio}/${mes}/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ justificacion: just }),
      });
      mensaje = 'Mes reabierto';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo reabrir';
    }
  }

  async function guardarNomina() {
    try {
      await api(`/consultoria/nomina/${anio}/${mes}`, {
        method: 'PUT',
        body: JSON.stringify({
          montoNomina: Number(montoNomina),
          ingresosFijos: Number(ingresosFijos),
        }),
      });
      mensaje = 'Nómina guardada';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error nómina';
    }
  }

  async function agregarDetalle() {
    if (!detalleForm.proyectoId) {
      error = 'Selecciona proyecto';
      return;
    }
    try {
      await api('/consultoria/ingresos-detalle', {
        method: 'POST',
        body: JSON.stringify({
          anio,
          mes,
          proyectoId: detalleForm.proyectoId,
          montoFacturado: Number(detalleForm.montoFacturado) || 0,
          montoCobrado: Number(detalleForm.montoCobrado) || 0,
          folio: detalleForm.folio,
          notas: detalleForm.notas,
        }),
      });
      detalleForm = { ...detalleForm, montoFacturado: 0, montoCobrado: 0, folio: '', notas: '' };
      mensaje = 'Detalle agregado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al agregar detalle';
    }
  }

  async function eliminarDetalle(id: string) {
    if (!confirm('¿Eliminar línea de detalle?')) return;
    try {
      await api(`/consultoria/ingresos-detalle/${id}`, { method: 'DELETE' });
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar';
    }
  }

  async function seedHistorico() {
    if (!confirm('Cargar histórico 2021–2023?')) return;
    try {
      await api('/consultoria/seed/historico-ingresos', { method: 'POST', body: '{}' });
      mensaje = 'Histórico cargado';
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Seed falló';
    }
  }

  function labelProyecto(d: Detalle) {
    const p = d.proyectoId;
    if (!p || typeof p === 'string') return '—';
    const cli = p.clienteId && typeof p.clienteId === 'object' ? p.clienteId.nombre : '';
    return `${cli ? cli + ' · ' : ''}${p.descripcion || ''}`;
  }

  onMount(() => {
    if (puedeEditar) cargar();
  });
</script>

<svelte:head>
  <title>Ingresos — Consultoría — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Ingresos Consultoría</h1>
      <p>Montos sin IVA · conciliación con detalle y facturas · egresos del módulo existente</p>
    </div>
    <div class="header-actions">
      <a href="/consultoria" class="btn btn-secondary">Inicio</a>
      <a href="/egresos" class="btn btn-secondary">Egresos</a>
      {#if $auth.usuario?.rol === 'admin'}
        <button type="button" class="btn btn-secondary" onclick={seedHistorico}>Seed histórico</button>
      {/if}
    </div>
  </header>

  {#if !puedeEditar}
    <p class="estado">Requiere rol admin o editor.</p>
  {:else}
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
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
      <button type="button" class="btn btn-secondary" onclick={cargar}>Buscar</button>
    </section>

    {#if cargando}
      <p class="estado">Cargando…</p>
    {:else if pack}
      {@const m = pack.mensual}
      <section class="kpi-row">
        <div class="kpi" title={m.formula?.cumplimientoMes}>
          <span class="muted">Cumplimiento mes</span>
          <strong>{pctLabel(m.cumplimientoMes)}</strong>
        </div>
        <div class="kpi" title={m.formula?.ingresoAcumulado}>
          <span class="muted">Ingreso acum.</span>
          <strong>{moneyMx(m.ingresoAcumulado)}</strong>
        </div>
        <div class="kpi" title={m.formula?.metaAcumulada}>
          <span class="muted">Meta acum.</span>
          <strong>{moneyMx(m.metaAcumulada)}</strong>
        </div>
        <div class="kpi" title={m.formula?.conciliacion}>
          <span class="muted">Conciliación</span>
          <strong class:warn={!m.conciliacion.cuadra}>
            {m.conciliacion.cuadra ? 'OK' : moneyMx(m.conciliacion.diferencia)}
          </strong>
        </div>
        <div class="kpi">
          <span class="muted">Estado</span>
          <strong>{m.cerrado ? 'Cerrado 🔒' : 'Abierto'}</strong>
        </div>
      </section>

      <section class="card grid-form">
        <h2>{MESES_ES[mes]} {anio}</h2>
        <div class="grid-3">
          <div class="form-group">
            <label class="label" for="fac">Facturación (sin IVA)</label>
            <input
              id="fac"
              class="input"
              type="number"
              step="0.01"
              bind:value={facturacion}
              disabled={m.cerrado}
            />
          </div>
          <div class="form-group">
            <label class="label" for="real">Ingreso real (sin IVA)</label>
            <input
              id="real"
              class="input"
              type="number"
              step="0.01"
              bind:value={ingresoReal}
              disabled={m.cerrado}
            />
          </div>
          <div class="form-group">
            <label class="label" for="meta">Meta</label>
            <input
              id="meta"
              class="input"
              type="number"
              step="0.01"
              bind:value={meta}
              disabled={m.cerrado}
            />
          </div>
          <div class="form-group full">
            <label class="label" for="notas">Notas</label>
            <input id="notas" class="input" bind:value={notasMes} disabled={m.cerrado} />
          </div>
        </div>
        <div class="acciones">
          {#if !m.cerrado}
            <button type="button" class="btn btn-primary" disabled={guardando} onclick={() => guardarMes()}
              >Guardar</button
            >
            <button type="button" class="btn btn-secondary" onclick={syncDetalle}
              >Sync desde detalle</button
            >
            <button type="button" class="btn btn-secondary" onclick={() => guardarMes({ forzar: true })}
              >Forzar descuadre…</button
            >
            <button type="button" class="btn btn-secondary" onclick={cerrar}>Cerrar mes</button>
          {:else}
            <button type="button" class="btn btn-secondary" onclick={reabrir}>Reabrir mes…</button>
          {/if}
        </div>
        {#if !m.conciliacion.cuadra}
          <p class="warn-text">
            Descuadre vs detalle: ingreso real {moneyMx(m.conciliacion.ingresoReal)} · suma cobrado
            {moneyMx(m.conciliacion.sumaDetalle)} · diff {moneyMx(m.conciliacion.diferencia)}
          </p>
        {/if}
      </section>

      <section class="card">
        <button type="button" class="link-toggle" onclick={() => (mesExpandido = !mesExpandido)}>
          {mesExpandido ? '▼' : '▶'} Detalle por proyecto ({pack.detalle.length})
        </button>
        {#if mesExpandido}
          {#if !m.cerrado}
            <div class="detalle-form">
              <select class="select" bind:value={detalleForm.proyectoId}>
                {#each proyectos as p}
                  <option value={p._id}
                    >{nombreRef(p.clienteId)} — {p.descripcion}</option
                  >
                {/each}
              </select>
              <input
                class="input"
                type="number"
                step="0.01"
                placeholder="Facturado"
                bind:value={detalleForm.montoFacturado}
              />
              <input
                class="input"
                type="number"
                step="0.01"
                placeholder="Cobrado"
                bind:value={detalleForm.montoCobrado}
              />
              <input class="input" placeholder="Folio" bind:value={detalleForm.folio} />
              <button type="button" class="btn btn-primary" onclick={agregarDetalle}>+ Línea</button>
            </div>
          {/if}
          <table class="tabla">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Facturado</th>
                <th>Cobrado</th>
                <th>Folio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each pack.detalle as d}
                <tr>
                  <td>{labelProyecto(d)}</td>
                  <td class="num">{moneyMx(d.montoFacturado)}</td>
                  <td class="num">{moneyMx(d.montoCobrado)}</td>
                  <td>{d.folio || '—'}</td>
                  <td>
                    {#if !m.cerrado}
                      <button type="button" class="link danger" onclick={() => eliminarDetalle(d._id)}
                        >✕</button
                      >
                    {/if}
                  </td>
                </tr>
              {:else}
                <tr><td colspan="5" class="estado">Sin detalle</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

      <section class="two-col">
        <div class="card">
          <h3 title="ingresos_fijos − nómina">Nómina vs ingresos fijos</h3>
          <div class="grid-2">
            <div class="form-group">
              <label class="label" for="nom">Nómina</label>
              <input id="nom" class="input" type="number" step="0.01" bind:value={montoNomina} />
            </div>
            <div class="form-group">
              <label class="label" for="fij">Ingresos fijos</label>
              <input id="fij" class="input" type="number" step="0.01" bind:value={ingresosFijos} />
            </div>
          </div>
          <p>
            Gap: <strong
              >{moneyMx((Number(ingresosFijos) || 0) - (Number(montoNomina) || 0))}</strong
            >
          </p>
          <button type="button" class="btn btn-secondary" onclick={guardarNomina}>Guardar nómina</button>
        </div>
        <div class="card">
          <h3>Conciliación Facturas / Egresos</h3>
          <p title={pack.facturasConciliacion.formula?.subtotal}>
            Facturas Consulting ({pack.facturasConciliacion.cantidad}): subtotal
            {moneyMx(pack.facturasConciliacion.subtotalSinIva)} · cobrado aprox.
            {moneyMx(pack.facturasConciliacion.cobradoAproxSinIva)}
          </p>
          <p title={pack.egresos.formula?.total}>
            Egresos Consulting ({pack.egresos.cantidad}): {moneyMx(pack.egresos.total)}
            · <a href={pack.egresos.enlace}>abrir módulo</a>
          </p>
        </div>
      </section>

      <section class="card">
        <h3>Año {anio} (mensual)</h3>
        <table class="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Facturación</th>
              <th>Ingreso real</th>
              <th>Meta</th>
              <th>%</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {#each anioLista.filter((x) => !x.esHistoricoAnual) as fila}
              <tr class:activo={fila.mes === mes}>
                <td>
                  <button
                    type="button"
                    class="link"
                    onclick={() => {
                      mes = fila.mes;
                      cargar();
                    }}>{MESES_ES[fila.mes]}</button
                  >
                </td>
                <td class="num">{moneyMx(fila.facturacion)}</td>
                <td class="num">{moneyMx(fila.ingresoReal)}</td>
                <td class="num">{moneyMx(fila.meta)}</td>
                <td class="num">{pctLabel(fila.cumplimientoMes)}</td>
                <td>{fila.cerrado ? '🔒' : '—'}{#if !fila.conciliacion.cuadra} ⚠{/if}</td>
              </tr>
            {:else}
              <tr><td colspan="6" class="estado">Sin meses capturados</td></tr>
            {/each}
          </tbody>
        </table>
      </section>

      {#if comparativo}
        <section class="card">
          <h3>Comparativo histórico (totales anuales)</h3>
          <table class="tabla">
            <thead>
              <tr>
                <th>Año</th>
                <th>Total ingreso</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {#each comparativo.series as s}
                <tr>
                  <td>{s.anio}</td>
                  <td class="num">{moneyMx(s.total)}</td>
                  <td>{s.esHistorico ? 'Histórico anual' : 'Suma mensual'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}
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
  .card {
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
  .warn {
    color: #b45309;
  }
  .warn-text {
    color: #b45309;
    margin: 0.75rem 0 0;
    font-size: 0.9rem;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
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
  .acciones {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .tabla {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-top: 0.5rem;
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
  .detalle-form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.75rem 0;
  }
  .detalle-form .select,
  .detalle-form .input {
    min-width: 8rem;
  }
  .link,
  .link-toggle {
    background: none;
    border: none;
    color: #1d4ed8;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .link.danger {
    color: #b91c1c;
  }
  tr.activo {
    background: #eff6ff;
  }
  .estado {
    color: #64748b;
  }
  @media (max-width: 800px) {
    .grid-3,
    .two-col,
    .grid-2 {
      grid-template-columns: 1fr;
    }
  }
</style>
