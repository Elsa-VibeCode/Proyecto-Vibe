<script lang="ts">
  import { onMount } from 'svelte';
  import { api, apiSubirArchivo, apiDescargar, apiDescargarPost } from '$lib/api';
  import type { ImportacionExcel } from '$lib/types/excel';
  import {
    detectarColumnas,
    filtrarFilas,
    valoresUnicos,
    calcularResumenNiveles,
    calcularResumenPuestos,
    filtrosVacios,
    formatearMoneda,
    type FiltrosRh,
    type MapeoColumnas,
    type ResumenNivel,
    type ResumenPuesto,
  } from '$lib/excelFiltros';

  let archivoSeleccionado = $state<File | null>(null);
  let importacionActual = $state<ImportacionExcel | null>(null);
  let historial = $state<ImportacionExcel[]>([]);
  let error = $state('');
  let mensaje = $state('');
  let cargando = $state(false);
  let cargandoHistorial = $state(true);
  let filtros = $state<FiltrosRh>(filtrosVacios());

  let mapeo = $derived(
    importacionActual ? detectarColumnas(importacionActual.columnas) : null
  );

  let filasFiltradas = $derived.by(() => {
    if (!importacionActual?.filas || !mapeo) return [];
    return filtrarFilas(importacionActual.filas, mapeo, filtros);
  });

  let puestosDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.puesto) : []
  );

  let nivelesDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.nivelPuesto) : []
  );

  let categoriasDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.categoria) : []
  );

  let resumenNiveles = $derived.by(() => {
    if (!mapeo) return [] as ResumenNivel[];
    return calcularResumenNiveles(filasFiltradas, mapeo);
  });

  let resumenPuestos = $derived.by(() => {
    if (!mapeo) return [] as ResumenPuesto[];
    return calcularResumenPuestos(filasFiltradas, mapeo);
  });

  let conSeguro = $derived(
    filasFiltradas.filter((f) => {
      if (!mapeo?.seguroMedico) return false;
      const v = String(f[mapeo.seguroMedico] ?? '').toLowerCase().trim();
      return ['si', 'sí', 'yes', 'true', '1', 'activo', 'incluido', 'con seguro'].includes(v);
    }).length
  );

  let tieneFiltrosRh = $derived(
    !!mapeo?.puesto || !!mapeo?.nivelPuesto || !!mapeo?.categoria || !!mapeo?.sueldo || !!mapeo?.tiempoPuesto || !!mapeo?.seguroMedico
  );

  let hayFiltrosActivos = $derived(
    Object.values(filtros).some((v) => v !== '')
  );

  function reiniciarFiltros() {
    filtros = filtrosVacios();
  }

  async function cargarHistorial() {
    cargandoHistorial = true;
    try {
      const data = await api<{ importaciones: ImportacionExcel[] }>('/excel');
      historial = data.importaciones;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar historial';
    } finally {
      cargandoHistorial = false;
    }
  }

  onMount(() => {
    cargarHistorial();
  });

  function seleccionarArchivo(e: Event) {
    const input = e.target as HTMLInputElement;
    archivoSeleccionado = input.files?.[0] ?? null;
    error = '';
    mensaje = '';
  }

  async function importarArchivo() {
    if (!archivoSeleccionado) {
      error = 'Selecciona un archivo Excel (.xlsx o .xls)';
      return;
    }

    cargando = true;
    error = '';
    mensaje = '';

    try {
      const data = await apiSubirArchivo<{
        mensaje: string;
        importacion: ImportacionExcel & { id: string };
      }>('/excel/importar', archivoSeleccionado);

      importacionActual = {
        ...data.importacion,
        _id: data.importacion.id,
      };
      reiniciarFiltros();
      mensaje = data.mensaje;
      archivoSeleccionado = null;
      await cargarHistorial();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al importar archivo';
    } finally {
      cargando = false;
    }
  }

  async function cargarImportacion(id: string) {
    cargando = true;
    error = '';

    try {
      const data = await api<{ importacion: ImportacionExcel }>(`/excel/${id}`);
      importacionActual = data.importacion;
      reiniciarFiltros();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar importación';
    } finally {
      cargando = false;
    }
  }

  async function exportarActual() {
    if (!importacionActual?._id) return;

    const nombre = `${importacionActual.nombreArchivo.replace(/\.(xlsx|xls)$/i, '')}-${hayFiltrosActivos ? 'filtrado' : 'exportado'}.xlsx`;

    try {
      if (hayFiltrosActivos) {
        await apiDescargarPost(`/excel/${importacionActual._id}/exportar-filtrado`, nombre, { filtros });
      } else {
        await apiDescargar(`/excel/${importacionActual._id}/exportar`, nombre);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al exportar';
    }
  }

  function valorCelda(fila: Record<string, unknown>, columna: string): string {
    const valor = fila[columna];
    return valor === null || valor === undefined ? '' : String(valor);
  }

  function etiquetaMapeo(mapeoColumnas: MapeoColumnas | null): string {
    if (!mapeoColumnas) return '';
    const campos = [
      mapeoColumnas.puesto && `Puesto: ${mapeoColumnas.puesto}`,
      mapeoColumnas.nivelPuesto && `Nivel: ${mapeoColumnas.nivelPuesto}`,
      mapeoColumnas.categoria && `Categoría: ${mapeoColumnas.categoria}`,
      mapeoColumnas.tiempoPuesto && `Tiempo: ${mapeoColumnas.tiempoPuesto}`,
      mapeoColumnas.sueldo && `Sueldo: ${mapeoColumnas.sueldo}`,
      mapeoColumnas.seguroMedico && `Seguro: ${mapeoColumnas.seguroMedico}`,
    ].filter(Boolean);
    return campos.join(' · ');
  }
</script>

<div class="excel-contenedor">
  <section class="card importar-seccion">
    <h2>Importar archivo Excel</h2>
    <p class="descripcion">
      Sube un archivo con columnas de RR.HH.: nivel de puesto, categoría, tiempo en el puesto, sueldo y seguro de gastos médicos.
    </p>

    <p class="ejemplo-descarga">
      ¿No tienes un archivo? Descarga el ejemplo con 10 empleados:
      <a href="/ejemplo-empleados.xlsx" download="ejemplo-empleados.xlsx" class="link-descarga">
        ejemplo-empleados.xlsx
      </a>
    </p>

    <div class="importar-controls">
      <input
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onchange={seleccionarArchivo}
      />
      <button class="btn btn-primary" onclick={importarArchivo} disabled={cargando || !archivoSeleccionado}>
        {cargando ? 'Procesando...' : 'Importar Excel'}
      </button>
    </div>

    {#if archivoSeleccionado}
      <p class="archivo-nombre">Archivo: {archivoSeleccionado.name}</p>
    {/if}
  </section>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if importacionActual}
    <section class="card reporte-seccion">
      <div class="reporte-header">
        <div>
          <h2>Reporte de datos</h2>
          <p>{importacionActual.nombreArchivo} · Hoja: {importacionActual.nombreHoja}</p>
          {#if mapeo && tieneFiltrosRh}
            <p class="mapeo-info">{etiquetaMapeo(mapeo)}</p>
          {/if}
        </div>
        <button class="btn btn-secondary" onclick={exportarActual}>
          Exportar {hayFiltrosActivos ? 'filtrado' : ''} a Excel
        </button>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Filas mostradas</span>
          <span class="stat-value">{filasFiltradas.length}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total importadas</span>
          <span class="stat-value">{importacionActual.totalFilas}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Con seguro médico</span>
          <span class="stat-value activo">{conSeguro}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Sin seguro médico</span>
          <span class="stat-value inactivo">{filasFiltradas.length - conSeguro}</span>
        </div>
      </div>

      {#if tieneFiltrosRh}
        <div class="filtros-panel">
          <div class="filtros-header">
            <h3>Filtros de RR.HH.</h3>
            {#if hayFiltrosActivos}
              <button type="button" class="link" onclick={reiniciarFiltros}>Limpiar filtros</button>
            {/if}
          </div>

          <div class="filtros-grid">
            {#if mapeo?.puesto}
              <div class="form-group">
                <label class="label" for="filtro-puesto">Puesto</label>
                <select id="filtro-puesto" class="select" bind:value={filtros.puesto}>
                  <option value="">Todos los puestos</option>
                  {#each puestosDisponibles as puesto}
                    <option value={puesto}>{puesto}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if mapeo?.nivelPuesto}
              <div class="form-group">
                <label class="label" for="filtro-nivel">Nivel de puesto</label>
                <select id="filtro-nivel" class="select" bind:value={filtros.nivelPuesto}>
                  <option value="">Todos los niveles</option>
                  {#each nivelesDisponibles as nivel}
                    <option value={nivel}>{nivel}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if mapeo?.categoria}
              <div class="form-group">
                <label class="label" for="filtro-categoria">Categoría</label>
                <select id="filtro-categoria" class="select" bind:value={filtros.categoria}>
                  <option value="">Todas las categorías</option>
                  {#each categoriasDisponibles as categoria}
                    <option value={categoria}>{categoria}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if mapeo?.tiempoPuesto}
              <div class="form-group">
                <label class="label" for="filtro-tiempo-min">Tiempo mín. (meses)</label>
                <input id="filtro-tiempo-min" class="input" type="number" min="0" bind:value={filtros.tiempoMin} placeholder="Ej. 6" />
              </div>
              <div class="form-group">
                <label class="label" for="filtro-tiempo-max">Tiempo máx. (meses)</label>
                <input id="filtro-tiempo-max" class="input" type="number" min="0" bind:value={filtros.tiempoMax} placeholder="Ej. 60" />
              </div>
            {/if}

            {#if mapeo?.sueldo}
              <div class="form-group">
                <label class="label" for="filtro-sueldo-min">Sueldo mínimo</label>
                <input id="filtro-sueldo-min" class="input" type="number" min="0" bind:value={filtros.sueldoMin} placeholder="Ej. 15000" />
              </div>
              <div class="form-group">
                <label class="label" for="filtro-sueldo-max">Sueldo máximo</label>
                <input id="filtro-sueldo-max" class="input" type="number" min="0" bind:value={filtros.sueldoMax} placeholder="Ej. 50000" />
              </div>
            {/if}

            {#if mapeo?.seguroMedico}
              <div class="form-group">
                <label class="label" for="filtro-seguro">Seguro de gastos médicos</label>
                <select id="filtro-seguro" class="select" bind:value={filtros.seguroMedico}>
                  <option value="">Todos</option>
                  <option value="si">Con seguro</option>
                  <option value="no">Sin seguro</option>
                </select>
              </div>
            {/if}
          </div>
        </div>

        {#if resumenPuestos.length > 0}
          <div class="resumen-niveles">
            <h3>Sueldos por puesto</h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Puesto</th>
                    <th>Empleados</th>
                    <th>Sueldo promedio</th>
                    <th>Sueldo mínimo</th>
                    <th>Sueldo máximo</th>
                    <th>Con seguro médico</th>
                  </tr>
                </thead>
                <tbody>
                  {#each resumenPuestos as item}
                    <tr>
                      <td><strong>{item.puesto}</strong></td>
                      <td>{item.empleados}</td>
                      <td>{formatearMoneda(item.sueldoPromedio)}</td>
                      <td>{formatearMoneda(item.sueldoMin)}</td>
                      <td>{formatearMoneda(item.sueldoMax)}</td>
                      <td>{item.conSeguro}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        {#if resumenNiveles.length > 0}
          <div class="resumen-niveles">
            <h3>Sueldos por nivel de puesto</h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nivel</th>
                    <th>Empleados</th>
                    <th>Sueldo promedio</th>
                    <th>Sueldo mínimo</th>
                    <th>Sueldo máximo</th>
                    <th>Con seguro médico</th>
                  </tr>
                </thead>
                <tbody>
                  {#each resumenNiveles as item}
                    <tr>
                      <td><strong>{item.nivel}</strong></td>
                      <td>{item.empleados}</td>
                      <td>{formatearMoneda(item.sueldoPromedio)}</td>
                      <td>{formatearMoneda(item.sueldoMin)}</td>
                      <td>{formatearMoneda(item.sueldoMax)}</td>
                      <td>{item.conSeguro}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      {:else}
        <div class="alert alert-error">
          No se detectaron columnas de RR.HH. Usa nombres como: Puesto, Nivel de puesto, Categoría, Tiempo en el puesto, Sueldo, Seguro de gastos médicos.
        </div>
      {/if}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {#each importacionActual.columnas as columna}
                <th>{columna}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if filasFiltradas.length === 0}
              <tr>
                <td colspan={importacionActual.columnas.length} class="sin-datos">
                  No hay registros con los filtros seleccionados.
                </td>
              </tr>
            {:else}
              {#each filasFiltradas as fila}
                <tr>
                  {#each importacionActual.columnas as columna}
                    <td>{valorCelda(fila, columna)}</td>
                  {/each}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <section class="card historial-seccion">
    <h2>Historial de importaciones</h2>

    {#if cargandoHistorial}
      <p class="estado">Cargando historial...</p>
    {:else if historial.length === 0}
      <p class="estado">Aún no has importado archivos Excel.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Hoja</th>
              <th>Filas</th>
              <th>Columnas</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {#each historial as item}
              <tr>
                <td>{item.nombreArchivo}</td>
                <td>{item.nombreHoja}</td>
                <td>{item.totalFilas}</td>
                <td>{item.columnas.length}</td>
                <td>
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleString('es-MX', {
                        timeZone: 'America/Mexico_City',
                      })
                    : '—'}
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick={() => cargarImportacion(item._id!)}>
                    Ver reporte
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>

<style>
  .excel-contenedor {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .importar-seccion,
  .reporte-seccion,
  .historial-seccion {
    padding: 1.25rem;
  }

  h2 {
    font-size: 1.1rem;
    margin-bottom: 0.35rem;
  }

  h3 {
    font-size: 0.95rem;
    margin-bottom: 0.75rem;
  }

  .descripcion,
  .mapeo-info,
  .ejemplo-descarga {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .link-descarga {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: underline;
  }

  .mapeo-info {
    margin-top: 0.35rem;
    margin-bottom: 0;
    font-size: 0.8rem;
  }

  .importar-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .archivo-nombre {
    margin-top: 0.75rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .reporte-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .reporte-header p {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--color-primary);
  }

  .stat-value.activo {
    color: var(--color-success);
  }

  .stat-value.inactivo {
    color: var(--color-danger);
  }

  .filtros-panel {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .filtros-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .filtros-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .resumen-niveles {
    margin-bottom: 1rem;
  }

  .sin-datos {
    text-align: center;
    color: var(--color-text-muted);
    padding: 1.5rem !important;
  }

  .estado {
    color: var(--color-text-muted);
    padding: 0.5rem 0;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  .link {
    color: var(--color-primary);
    font-weight: 600;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
  }
</style>
