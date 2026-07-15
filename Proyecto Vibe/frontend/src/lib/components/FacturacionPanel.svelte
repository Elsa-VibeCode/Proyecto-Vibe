<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import { formatearFecha } from '$lib/utils';
  import type { FiltrosFacturacion, ResumenModulo, UnidadFactura } from '$lib/types/admin';
  import {
    filtrosFacturacionVacios,
    cargarFiltrosFacturacionGuardados,
    guardarFiltrosFacturacion,
  } from '$lib/types/admin';

  let resumen = $state<ResumenModulo | null>(null);
  let error = $state('');
  let cargando = $state(true);
  let reclasificando = $state(false);
  let guardandoUnidad = $state('');
  let mensaje = $state('');
  let filtros = $state<FiltrosFacturacion>(filtrosFacturacionVacios());
  let opcionesFiltro = $state({
    clientes: [] as string[],
    areas: [] as string[],
    estatus: [] as string[],
    mesesFacturacion: [] as string[],
    mesesPago: [] as string[],
  });

  let puedeEditar = $derived($auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor');

  let clientes = $derived(opcionesFiltro.clientes);
  let areas = $derived(opcionesFiltro.areas);
  let estatusOpciones = $derived(opcionesFiltro.estatus);
  let mesesFacturacion = $derived(opcionesFiltro.mesesFacturacion);
  let mesesPago = $derived(opcionesFiltro.mesesPago);

  function mesDeValor(valor: unknown): string {
    if (valor === null || valor === undefined || valor === '') return '';
    const d = valor instanceof Date ? valor : new Date(String(valor));
    if (Number.isNaN(d.getTime()) || d.getTime() <= 0 || d.getUTCFullYear() < 2000) return '';
    return d.toISOString().slice(0, 7);
  }

  function extraerOpciones(data: ResumenModulo) {
    const m = data.mapeo;
    const filas = data.filas ?? [];
    const mesesFact = new Set<string>();
    const mesesPag = new Set<string>();

    for (const f of filas) {
      if (m.fechaFacturacion) {
        const mes = mesDeValor(f[m.fechaFacturacion]);
        if (mes) mesesFact.add(mes);
      }
      if (m.fechaPago) {
        const mes = mesDeValor(f[m.fechaPago]);
        if (mes) mesesPag.add(mes);
      }
    }

    return {
      clientes: m.cliente
        ? [...new Set(filas.map((f) => String(f[m.cliente!] ?? '').trim()).filter(Boolean))].sort()
        : [],
      areas: m.areaVenta
        ? [...new Set(filas.map((f) => String(f[m.areaVenta!] ?? '').trim()).filter(Boolean))].sort()
        : [],
      estatus: m.estatusPago
        ? [...new Set(filas.map((f) => String(f[m.estatusPago!] ?? '').trim()).filter(Boolean))].sort()
        : [],
      mesesFacturacion: [...mesesFact].sort((a, b) => b.localeCompare(a)),
      mesesPago: [...mesesPag].sort((a, b) => b.localeCompare(a)),
    };
  }

  async function cargarMesesDisponibles() {
    try {
      const [fact, pago] = await Promise.all([
        api<{ ok: boolean; data: { meses: string[] } }>('/facturas/meses-facturacion'),
        api<{ ok: boolean; data: { meses: string[] } }>('/facturas/meses-pago'),
      ]);
      return {
        mesesFacturacion: fact.data?.meses ?? [],
        mesesPago: pago.data?.meses ?? [],
      };
    } catch {
      return { mesesFacturacion: [] as string[], mesesPago: [] as string[] };
    }
  }

  function combinarMeses(apiMeses: string[], filaMeses: string[]): string[] {
    return [...new Set([...apiMeses, ...filaMeses])].sort((a, b) => b.localeCompare(a));
  }

  function etiquetaMes(yyyyMm: string): string {
    const [y, m] = yyyyMm.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const idx = Number(m) - 1;
    if (!y || idx < 0 || idx > 11) return yyyyMm;
    return `${meses[idx]} ${y}`;
  }

  function actualizarOpcionesFiltro(data: ResumenModulo, mesesApi?: { mesesFacturacion: string[]; mesesPago: string[] }) {
    const deFilas = extraerOpciones(data);
    opcionesFiltro = {
      ...deFilas,
      mesesFacturacion: combinarMeses(
        data.mesesFacturacion ?? mesesApi?.mesesFacturacion ?? [],
        deFilas.mesesFacturacion
      ),
      mesesPago: combinarMeses(data.mesesPago ?? mesesApi?.mesesPago ?? [], deFilas.mesesPago),
    };
  }

  let columnasTabla = $derived(() => {
    if (!resumen?.mapeo) return [];
    return [
      resumen.mapeo.fechaFacturacion,
      resumen.mapeo.noFactura,
      resumen.mapeo.cliente,
      resumen.mapeo.conceptoFactura,
      resumen.mapeo.areaVenta,
      resumen.mapeo.total,
      resumen.mapeo.fechaPago,
      resumen.mapeo.estatusPago,
    ].filter(Boolean) as string[];
  });

  async function cargarDatos(cargarOpciones = false, mesesApi?: { mesesFacturacion: string[]; mesesPago: string[] }) {
    cargando = true;
    error = '';

    const params = new URLSearchParams();
    if (filtros.cliente) params.set('cliente', filtros.cliente);
    if (filtros.areaVenta) params.set('areaVenta', filtros.areaVenta);
    if (filtros.estatusPago) params.set('estatusPago', filtros.estatusPago);
    if (filtros.mesFacturacion) params.set('mesFacturacion', filtros.mesFacturacion);
    if (filtros.mesPago) params.set('mesPago', filtros.mesPago);
    if (filtros.totalMin) params.set('totalMin', filtros.totalMin);
    if (filtros.totalMax) params.set('totalMax', filtros.totalMax);
    if (filtros.soloSinClasificar) params.set('soloSinClasificar', filtros.soloSinClasificar);
    if (filtros.estadoClasificacion) params.set('estadoClasificacion', filtros.estadoClasificacion);

    const query = params.toString();
    const endpoint = `/excel/ultima/facturacion${query ? `?${query}` : ''}`;

    try {
      resumen = await api<ResumenModulo>(endpoint);
      if (resumen) {
        if (cargarOpciones) {
          actualizarOpcionesFiltro(resumen, mesesApi);
        } else if (resumen.mesesFacturacion?.length || resumen.mesesPago?.length) {
          opcionesFiltro = {
            ...opcionesFiltro,
            mesesFacturacion: combinarMeses(
              resumen.mesesFacturacion ?? [],
              opcionesFiltro.mesesFacturacion
            ),
            mesesPago: combinarMeses(resumen.mesesPago ?? [], opcionesFiltro.mesesPago),
          };
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar facturación';
      resumen = null;
    } finally {
      cargando = false;
    }
  }

  onMount(async () => {
    filtros = cargarFiltrosFacturacionGuardados();
    const mesesApi = await cargarMesesDisponibles();
    await cargarDatos(true, mesesApi);
  });

  function aplicarFiltros() {
    guardarFiltrosFacturacion(filtros);
    cargarDatos(false);
  }

  function limpiarFiltros() {
    filtros = filtrosFacturacionVacios();
    guardarFiltrosFacturacion(filtros);
    cargarDatos(false);
  }

  function valorCelda(fila: Record<string, unknown>, columna: string): string {
    const valor = fila[columna];
    const m = resumen?.mapeo;
    if (columna === m?.total) {
      const numero = Number(String(valor ?? '').replace(/[$,\s]/g, ''));
      return Number.isFinite(numero) ? formatearMoneda(numero) : String(valor ?? '');
    }
    if (columna === m?.fechaFacturacion || columna === m?.fechaPago) {
      if (valor === null || valor === undefined || valor === '') return '';
      const d = valor instanceof Date ? valor : new Date(String(valor));
      if (Number.isNaN(d.getTime()) || d.getTime() <= 0 || d.getUTCFullYear() < 2000) return 'Sin fecha';
      const iso =
        valor instanceof Date
          ? valor.toISOString()
          : typeof valor === 'string' && /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(valor.trim())
            ? valor
            : String(valor);
      if (typeof iso === 'string' && /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(iso.trim())) {
        return iso.trim();
      }
      return formatearFecha(iso);
    }
    return valor === null || valor === undefined ? '' : String(valor);
  }

  async function reclasificar() {
    reclasificando = true;
    mensaje = '';
    try {
      const data = await api<{ mensaje: string }>('/mapas/reclasificar-facturacion', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      mensaje = data.mensaje;
      await cargarDatos(false);
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo reclasificar';
    } finally {
      reclasificando = false;
    }
  }

  async function cambiarUnidadFactura(fila: Record<string, unknown>, unidad: UnidadFactura) {
    const facturaId = String(fila.facturaId ?? '');
    if (!puedeEditar || !facturaId) return;
    guardandoUnidad = facturaId;
    try {
      await api(`/facturas/${facturaId}/clasificar`, {
        method: 'PATCH',
        body: JSON.stringify({ unidad }),
      });
      await cargarDatos(false);
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo actualizar la unidad';
    } finally {
      guardandoUnidad = '';
    }
  }

  function etiquetaClasificacion(fila: Record<string, unknown>): string {
    if (fila.excluidoDeTotales) return 'Cancelada';
    if (fila.estadoClasificacion === 'no_encontrado') return 'Sin clasificar';
    if (fila.estadoClasificacion === 'manual') return 'Manual';
    if (fila.estadoClasificacion === 'por_confirmar') return 'Por confirmar';
    return String(fila.unidadClasificada ?? 'Consulting');
  }

  function claseBadge(fila: Record<string, unknown>): string {
    if (fila.excluidoDeTotales) return 'cancelada';
    if (fila.estadoClasificacion === 'no_encontrado') return 'sin-clasificar';
    if (fila.estadoClasificacion === 'manual') return 'manual';
    if (fila.estadoClasificacion === 'por_confirmar') return 'por-confirmar';
    return 'confirmada';
  }

  function nombreClienteFila(fila: Record<string, unknown>): string {
    const col = resumen?.mapeo.cliente;
    return col ? String(fila[col] ?? '').trim() : '';
  }

  let haySinClasificar = $derived(
    (resumen?.filas ?? []).some((f) => f.estadoClasificacion === 'no_encontrado')
  );
</script>

{#if cargando}
  <p class="estado">Cargando facturación...</p>
{:else if error}
  <div class="alert alert-error">
    {error}
    <p class="ayuda">
      Importa la hoja <strong>FACTURACION INGRESOS</strong> desde
      <a href="/datos-excel">Datos Excel</a>.
    </p>
  </div>
{:else if resumen?.facturacion}
  <div class="modulo-contenido">
    <div class="meta-info card">
      <p>
        <strong>{resumen.importacion.nombreArchivo}</strong> · {resumen.importacion.nombreHoja} ·
        {resumen.totalFilas} facturas mostradas
        {#if resumen.facturacion?.cantidadPagadas !== undefined}
          · {resumen.facturacion.cantidadPagadas} pagadas · {resumen.facturacion.cantidadPendientes} pendientes
        {/if}
      </p>
      {#if resumen.clasificacionFacturacion}
        {@const c = resumen.clasificacionFacturacion.resumen}
        <p class="clasificacion-meta">
          Clasificación:
          {c.autoConfirmado} confirmadas · {c.porConfirmar} por confirmar
          {#if (c.manual ?? 0) > 0}· {c.manual} manual{/if}
          · <strong class="alerta">{c.noEncontrado} sin clasificar</strong>
          {#if c.cancelados > 0}· {c.cancelados} canceladas (excluidas de totales){/if}
        </p>
        {#if !resumen.clasificacionFacturacion.mapaCargado}
          <p class="aviso-mapa">
            El mapa de clientes está vacío. Ejecuta el seed o agrega clientes en
            <a href="/clasificacion">Clasificación</a>.
          </p>
        {/if}
      {/if}
    </div>

    {#if puedeEditar}
      <section class="card ayuda-editor">
        <h3>Cómo editar como Editor</h3>
        <ul>
          <li>
            <strong>Unidad por factura</strong> (Consulting, Technologies, Grupo): elige la unidad en
            la columna <em>Unidad</em> de cada fila. Útil cuando un mismo cliente (ej. ENLAC) factura
            a distintas unidades. Las asignaciones manuales no se sobrescriben al reclasificar.
          </li>
          <li>
            <strong>Regla por cliente</strong> (todas las facturas del cliente): ve a
            <a href="/clasificacion">Clasificación</a> → Clientes → agrega o edita el cliente, luego
            <strong>Reclasificar pendientes</strong>.
          </li>
          <li>
            <strong>Estatus de pago</strong> (Pagado / Pendiente): actualiza el Excel en
            <a href="/datos-excel">Datos Excel</a> y vuelve a migrar.
          </li>
        </ul>
        {#if haySinClasificar}
          <p class="aviso-sin-clasificar">
            Hay facturas sin clasificar. Asigna la unidad en la tabla o agrega el cliente al mapa en
            <a href="/clasificacion">Clasificación</a>.
          </p>
        {/if}
      </section>
    {/if}

    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">Total facturado</span>
        <span class="stat-value">{formatearMoneda(resumen.facturacion.totalFacturado)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Pagado</span>
        <span class="stat-value activo">{formatearMoneda(resumen.facturacion.totalPagado)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Pendiente</span>
        <span class="stat-value inactivo">{formatearMoneda(resumen.facturacion.totalPendiente)}</span>
      </div>
      <div class="stat-card card">
        <span class="stat-label">Facturas</span>
        <span class="stat-value">{resumen.facturacion.facturas}</span>
      </div>
    </div>

    <section class="card filtros-panel">
      <div class="filtros-header">
        <h3>Filtros</h3>
        <div class="filtros-acciones">
          {#if puedeEditar}
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              disabled={reclasificando}
              onclick={reclasificar}
            >
              {reclasificando ? 'Reclasificando...' : 'Reclasificar pendientes'}
            </button>
          {/if}
        </div>
      </div>
      {#if mensaje}
        <p class="mensaje-ok">{mensaje}</p>
      {/if}
      <div class="filtros-grid">
        <div class="form-group">
          <label class="label" for="f-mes-fact">Mes facturación</label>
          <select id="f-mes-fact" class="select" bind:value={filtros.mesFacturacion}>
            <option value="">Todos</option>
            {#each mesesFacturacion as mes}
              <option value={mes}>{etiquetaMes(mes)}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-mes-pago">Mes pago</label>
          <select id="f-mes-pago" class="select" bind:value={filtros.mesPago}>
            <option value="">Todos</option>
            {#each mesesPago as mes}
              <option value={mes}>{etiquetaMes(mes)}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-cliente">Cliente</label>
          <select id="f-cliente" class="select" bind:value={filtros.cliente}>
            <option value="">Todos</option>
            {#each clientes as cliente}
              <option value={cliente}>{cliente}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-area">Área de venta</label>
          <select id="f-area" class="select" bind:value={filtros.areaVenta}>
            <option value="">Todas</option>
            {#each areas as area}
              <option value={area}>{area}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-estatus">Estatus de pago</label>
          <select id="f-estatus" class="select" bind:value={filtros.estatusPago}>
            <option value="">Todos</option>
            {#each estatusOpciones as estatus}
              <option value={estatus}>{estatus}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="label" for="f-min">Monto mínimo</label>
          <input id="f-min" class="input" type="number" bind:value={filtros.totalMin} placeholder="Ej. 10000" />
        </div>
        <div class="form-group">
          <label class="label" for="f-max">Monto máximo</label>
          <input id="f-max" class="input" type="number" bind:value={filtros.totalMax} placeholder="Ej. 500000" />
        </div>
        <div class="form-group">
          <label class="label" for="f-clasif">Clasificación</label>
          <select id="f-clasif" class="select" bind:value={filtros.estadoClasificacion}>
            <option value="">Todas</option>
            <option value="auto_confirmado">Auto confirmadas</option>
            <option value="por_confirmar">Por confirmar</option>
            <option value="manual">Manual</option>
            <option value="no_encontrado">Sin clasificar</option>
          </select>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={filtros.soloSinClasificar === 'true'}
              onchange={(e) => {
                filtros.soloSinClasificar = e.currentTarget.checked ? 'true' : '';
              }}
            />
            Solo sin clasificar
          </label>
        </div>
      </div>
      <div class="filtros-footer">
        <button class="btn btn-primary btn-sm" onclick={aplicarFiltros}>Aplicar filtros</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick={limpiarFiltros}>Limpiar filtros</button>
      </div>
    </section>

    <div class="resumenes-grid">
      <section class="card">
        <h3>Top clientes</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Facturas</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {#each resumen.facturacion.porCliente as item}
                <tr>
                  <td>{item.nombre}</td>
                  <td>{item.facturas}</td>
                  <td>{formatearMoneda(item.monto)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3>Por unidad clasificada</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Unidad</th><th>Facturas</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {#if (resumen.facturacion.porUnidad ?? []).length === 0}
                <tr>
                  <td colspan="3" class="tabla-vacia">
                    Sin unidades clasificadas aún. Ve a
                    <a href="/clasificacion">Clasificación</a> o importa la hoja
                    <strong>Mapa Unidades</strong> en Datos Excel.
                  </td>
                </tr>
              {:else}
                {#each resumen.facturacion.porUnidad ?? [] as item}
                  <tr class:sin-clasificar-fila={item.nombre === 'sin_clasificar'}>
                    <td>
                      {item.nombre === 'sin_clasificar' ? 'Sin clasificar' : item.nombre}
                    </td>
                    <td>{item.facturas}</td>
                    <td>{formatearMoneda(item.monto)}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="card tabla-detalle">
      <h3>Detalle de facturas</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Estado</th>
              <th class="col-unidad">
                Unidad
                {#if puedeEditar}<span class="col-editar" title="Editable por factura">✎</span>{/if}
              </th>
              {#each columnasTabla() as columna}
                <th>{columna}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each resumen.filas ?? [] as fila}
              <tr class:sin-clasificar={fila.estadoClasificacion === 'no_encontrado'}>
                <td>
                  <span class="badge-clasif {claseBadge(fila)}">{etiquetaClasificacion(fila)}</span>
                  {#if puedeEditar && fila.estadoClasificacion === 'no_encontrado' && !fila.facturaId}
                    <a class="link-clasificar" href="/clasificacion" title="Agregar cliente al mapa">
                      Mapa →
                    </a>
                  {/if}
                </td>
                <td class="celda-unidad">
                  {#if fila.facturaId}
                    <select
                      class="select select-unidad"
                      class:select-editable={puedeEditar}
                      disabled={!puedeEditar || guardandoUnidad === String(fila.facturaId)}
                      value={fila.unidadClasificada === 'sin_clasificar' ? 'sin_clasificar' : String(fila.unidadClasificada ?? 'sin_clasificar')}
                      onchange={(e) => {
                        const valor = e.currentTarget.value;
                        if (valor === 'sin_clasificar') return;
                        cambiarUnidadFactura(fila, valor as UnidadFactura);
                      }}
                    >
                      <option value="sin_clasificar" disabled={fila.unidadClasificada !== 'sin_clasificar'}>
                        Sin clasificar
                      </option>
                      <option value="Consulting">Consulting</option>
                      <option value="Technologies">Technologies</option>
                      <option value="Grupo">Grupo</option>
                    </select>
                  {:else}
                    {fila.unidadClasificada === 'sin_clasificar' ? '—' : String(fila.unidadClasificada ?? '—')}
                  {/if}
                </td>
                {#each columnasTabla() as columna}
                  <td>{valorCelda(fila, columna)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
{/if}

<style>
  .modulo-contenido { display: flex; flex-direction: column; gap: 1.25rem; }
  .ayuda-editor { padding: 1rem 1.1rem; font-size: 0.875rem; }
  .ayuda-editor h3 { font-size: 0.9rem; margin-bottom: 0.5rem; }
  .ayuda-editor ul { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .aviso-sin-clasificar { margin: 0.65rem 0 0; color: var(--color-warning); font-size: 0.82rem; }
  .link-clasificar { display: block; margin-top: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--color-primary); }
  .meta-info { padding: 0.875rem 1rem; font-size: 0.875rem; color: var(--color-text-muted); }
  .clasificacion-meta { margin-top: 0.35rem; }
  .clasificacion-meta .alerta { color: var(--color-danger); }
  .aviso-mapa { margin-top: 0.35rem; color: var(--color-warning); font-size: 0.82rem; }
  .mensaje-ok { color: var(--color-success); font-size: 0.85rem; margin-bottom: 0.5rem; }
  .filtros-acciones { display: flex; gap: 0.75rem; align-items: center; }
  .checkbox-group { display: flex; align-items: end; }
  .checkbox-label { display: flex; gap: 0.5rem; align-items: center; font-size: 0.875rem; }
  .badge-clasif { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 999px; font-weight: 600; white-space: nowrap; }
  .badge-clasif.confirmada { background: #dcfce7; color: #166534; }
  .badge-clasif.manual { background: #dbeafe; color: #1e40af; }
  .badge-clasif.por-confirmar { background: #fef9c3; color: #854d0e; }
  .badge-clasif.sin-clasificar { background: #fee2e2; color: #991b1b; }
  .badge-clasif.cancelada { background: #f1f5f9; color: #64748b; }
  tr.sin-clasificar { background: #fff7ed; }
  tr.sin-clasificar-fila { background: #fff7ed; }
  .tabla-vacia { text-align: center; color: var(--color-text-muted); padding: 1.25rem; font-size: 0.875rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
  .stat-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
  .stat-value { font-size: 1.35rem; font-weight: 700; color: var(--color-primary); }
  .stat-value.activo { color: var(--color-success); }
  .stat-value.inactivo { color: var(--color-danger); }
  .filtros-panel { padding: 1rem; }
  .filtros-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .filtros-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
  .filtros-footer { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .resumenes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
  .resumenes-grid .card, .tabla-detalle { padding: 1rem; }
  h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
  .estado { color: var(--color-text-muted); }
  .ayuda { margin-top: 0.5rem; font-size: 0.875rem; }
  .link { color: var(--color-primary); font-weight: 600; background: none; border: none; cursor: pointer; }
  .btn-sm { margin-top: 0.25rem; }
  .col-unidad { white-space: nowrap; }
  .col-editar { font-size: 0.75rem; opacity: 0.7; margin-left: 0.2rem; }
  .celda-unidad { min-width: 9rem; }
  .select-unidad { font-size: 0.8rem; padding: 0.25rem 0.4rem; min-width: 8.5rem; width: 100%; }
  .select-unidad:not(.select-editable) { appearance: none; border: none; background: transparent; color: inherit; pointer-events: none; padding-left: 0; }
  .select-unidad.select-editable { border: 1px solid var(--color-border); border-radius: 6px; background: white; cursor: pointer; }
  .select-unidad.select-editable:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
</style>
