<script lang="ts">
  import { onMount } from 'svelte';
  import { api, apiSubirArchivo, apiDescargar, apiDescargarPost } from '$lib/api';
  import type { ImportacionExcel, PrevisualizacionLibro } from '$lib/types/excel';
  import {
    detectarColumnas,
    detectarTipoHoja,
    etiquetaTipoHoja,
    filtrarFilas,
    valoresUnicos,
    calcularResumenNiveles,
    calcularResumenPuestos,
    calcularResumenUnidades,
    filtrosVacios,
    formatearMoneda,
    tieneFiltrosDetectados,
    type FiltrosRh,
    type MapeoColumnas,
    type ResumenNivel,
    type ResumenPuesto,
    type ResumenUnidad,
    type TipoHoja,
  } from '$lib/excelFiltros';

  let archivoSeleccionado = $state<File | null>(null);
  let importacionActual = $state<ImportacionExcel | null>(null);
  let historial = $state<ImportacionExcel[]>([]);
  let previsualizacion = $state<PrevisualizacionLibro | null>(null);
  let hojaSeleccionada = $state('');
  let error = $state('');
  let mensaje = $state('');
  let cargando = $state(false);
  let cargandoHistorial = $state(true);
  let cargandoPrevisualizacion = $state(false);
  let filtros = $state<FiltrosRh>(filtrosVacios());

  let mapeo = $derived(
    importacionActual ? detectarColumnas(importacionActual.columnas) : null
  );

  let tipoHoja = $derived(
    (importacionActual?.tipoHoja as TipoHoja | undefined) ??
      (mapeo ? detectarTipoHoja(mapeo, importacionActual?.columnas ?? []) : ('generico' as TipoHoja))
  );

  let filasFiltradas = $derived.by(() => {
    if (!importacionActual?.filas || !mapeo) return [];
    return filtrarFilas(importacionActual.filas, mapeo, filtros);
  });

  let colaboradoresDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.colaborador) : []
  );

  let clientesDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.cliente) : []
  );

  let unidadesDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.unidad) : []
  );

  let estadosDisponibles = $derived(
    importacionActual && mapeo ? valoresUnicos(importacionActual.filas ?? [], mapeo.estado) : []
  );

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

  let resumenUnidades = $derived.by(() => {
    if (!mapeo) return [] as ResumenUnidad[];
    return calcularResumenUnidades(filasFiltradas, mapeo);
  });

  let conSeguro = $derived(
    filasFiltradas.filter((f) => {
      if (!mapeo?.seguroMedico) return false;
      const v = String(f[mapeo.seguroMedico] ?? '').toLowerCase().trim();
      return ['si', 'sí', 'yes', 'true', '1', 'activo', 'incluido', 'con seguro'].includes(v);
    }).length
  );

  let tieneFiltrosRh = $derived(mapeo ? tieneFiltrosDetectados(mapeo) : false);

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

  async function seleccionarArchivo(e: Event) {
    const input = e.target as HTMLInputElement;
    archivoSeleccionado = input.files?.[0] ?? null;
    previsualizacion = null;
    hojaSeleccionada = '';
    error = '';
    mensaje = '';

    if (!archivoSeleccionado) return;

    cargandoPrevisualizacion = true;
    try {
      const data = await apiSubirArchivo<PrevisualizacionLibro>(
        '/excel/previsualizar',
        archivoSeleccionado
      );
      previsualizacion = data;
      hojaSeleccionada = data.hojaSugerida;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al previsualizar el archivo';
      archivoSeleccionado = null;
    } finally {
      cargandoPrevisualizacion = false;
    }
  }

  async function importarArchivo() {
    if (!archivoSeleccionado) {
      error = 'Selecciona un archivo Excel (.xlsx o .xls)';
      return;
    }

    if (!hojaSeleccionada) {
      error = 'Selecciona la hoja que deseas importar';
      return;
    }

    cargando = true;
    error = '';
    mensaje = '';

    try {
      const data = await apiSubirArchivo<{
        mensaje: string;
        importacion: ImportacionExcel & { id: string; tipoHoja?: string };
      }>('/excel/importar', archivoSeleccionado, 'archivo', {
        nombreHoja: hojaSeleccionada,
      });

      importacionActual = {
        ...data.importacion,
        _id: data.importacion.id,
        tipoHoja: data.importacion.tipoHoja,
      };
      reiniciarFiltros();
      mensaje = data.mensaje;
      archivoSeleccionado = null;
      previsualizacion = null;
      hojaSeleccionada = '';
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
      mapeoColumnas.colaborador && `Colaborador: ${mapeoColumnas.colaborador}`,
      mapeoColumnas.cliente && `Cliente: ${mapeoColumnas.cliente}`,
      mapeoColumnas.unidad && `Unidad: ${mapeoColumnas.unidad}`,
      mapeoColumnas.estado && `Estado: ${mapeoColumnas.estado}`,
      mapeoColumnas.puesto && `Puesto: ${mapeoColumnas.puesto}`,
      mapeoColumnas.nivelPuesto && `Nivel: ${mapeoColumnas.nivelPuesto}`,
      mapeoColumnas.categoria && `Categoría: ${mapeoColumnas.categoria}`,
      mapeoColumnas.tiempoPuesto && `Tiempo: ${mapeoColumnas.tiempoPuesto}`,
      mapeoColumnas.sueldo && `Sueldo: ${mapeoColumnas.sueldo}`,
      mapeoColumnas.seguroMedico && `Seguro: ${mapeoColumnas.seguroMedico}`,
    ].filter(Boolean);
    return campos.join(' · ');
  }

  function hojaPrevisualizada(nombre: string) {
    return previsualizacion?.hojas.find((h) => h.nombreHoja === nombre);
  }
</script>

<div class="excel-contenedor">
  <section class="card importar-seccion">
    <h2>Importar archivo Excel</h2>
    <p class="descripcion">
      Sube un archivo Excel con varias hojas. El sistema detecta automáticamente los encabezados y te permite elegir la hoja a importar (por ejemplo: <strong>Sueldos por Unidad</strong> o <strong>Mapa Unidades</strong>).
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
      <button
        class="btn btn-primary"
        onclick={importarArchivo}
        disabled={cargando || cargandoPrevisualizacion || !archivoSeleccionado || !hojaSeleccionada}
      >
        {cargando ? 'Procesando...' : 'Importar Excel'}
      </button>
    </div>

    {#if archivoSeleccionado}
      <p class="archivo-nombre">Archivo: {archivoSeleccionado.name}</p>
    {/if}

    {#if cargandoPrevisualizacion}
      <p class="estado">Analizando hojas del archivo...</p>
    {/if}

    {#if previsualizacion}
      <div class="selector-hojas">
        <label class="label" for="hoja-excel">Hoja a importar</label>
        <select id="hoja-excel" class="select" bind:value={hojaSeleccionada}>
          {#each previsualizacion.hojas as hoja}
            <option value={hoja.nombreHoja}>
              {hoja.nombreHoja} ({hoja.totalFilas} filas){hoja.recomendada ? ' ★' : ''}
            </option>
          {/each}
        </select>

        {#if hojaSeleccionada}
          {@const info = hojaPrevisualizada(hojaSeleccionada)}
          {#if info}
            <div class="hoja-preview">
              <p>
                Encabezados en fila {info.filaEncabezado} ·
                {info.columnas.length} columnas · {info.totalFilas} registros
              </p>
              {#if info.columnas.length > 0}
                <p class="columnas-preview">
                  Columnas: {info.columnas.join(', ')}
                </p>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </section>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}

  {#if importacionActual && ['facturacion', 'resumen-mensual', 'estado-cuenta', 'estado-cuenta-flujo', 'conciliacion'].includes(tipoHoja)}
    <div class="alert alert-info">
      {#if tipoHoja === 'facturacion'}
        Datos de facturación importados. Ver el módulo completo en
        <a href="/facturacion">Facturación</a>.
      {:else if tipoHoja === 'resumen-mensual'}
        Resumen mensual importado. Ver el dashboard en
        <a href="/finanzas">Finanzas</a>.
      {:else if tipoHoja === 'estado-cuenta' || tipoHoja === 'estado-cuenta-flujo'}
        Estado de cuenta importado. Ver el módulo en
        <a href="/estado-cuenta">Estado de cuenta</a>.
      {:else if tipoHoja === 'conciliacion'}
        Conciliación bancaria importada. Ver el módulo en
        <a href="/conciliacion">Conciliación</a>.
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if importacionActual}
    <section class="card reporte-seccion">
      <div class="reporte-header">
        <div>
          <h2>Reporte de datos</h2>
          <p>
            {importacionActual.nombreArchivo} · Hoja: {importacionActual.nombreHoja}
            {#if importacionActual.filaEncabezado}
              · Encabezados fila {importacionActual.filaEncabezado}
            {/if}
          </p>
          {#if mapeo && tieneFiltrosRh}
            <p class="tipo-hoja-badge">{etiquetaTipoHoja(tipoHoja)}</p>
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
        {#if mapeo?.seguroMedico}
          <div class="stat-card">
            <span class="stat-label">Con seguro médico</span>
            <span class="stat-value activo">{conSeguro}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Sin seguro médico</span>
            <span class="stat-value inactivo">{filasFiltradas.length - conSeguro}</span>
          </div>
        {:else if resumenUnidades.length > 0}
          <div class="stat-card">
            <span class="stat-label">Unidades</span>
            <span class="stat-value">{resumenUnidades.length}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Pendientes</span>
            <span class="stat-value inactivo">
              {resumenUnidades.reduce((sum, u) => sum + u.pendientes, 0)}
            </span>
          </div>
        {/if}
      </div>

      {#if tieneFiltrosRh}
        <div class="filtros-panel">
          <div class="filtros-header">
            <h3>Filtros</h3>
            {#if hayFiltrosActivos}
              <button type="button" class="link" onclick={reiniciarFiltros}>Limpiar filtros</button>
            {/if}
          </div>

          <div class="filtros-grid">
            {#if mapeo?.colaborador}
              <div class="form-group">
                <label class="label" for="filtro-colaborador">Colaborador</label>
                <select id="filtro-colaborador" class="select" bind:value={filtros.colaborador}>
                  <option value="">Todos</option>
                  {#each colaboradoresDisponibles as colaborador}
                    <option value={colaborador}>{colaborador}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if mapeo?.cliente}
              <div class="form-group">
                <label class="label" for="filtro-cliente">Cliente</label>
                <select id="filtro-cliente" class="select" bind:value={filtros.cliente}>
                  <option value="">Todos</option>
                  {#each clientesDisponibles as cliente}
                    <option value={cliente}>{cliente}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if mapeo?.unidad}
              <div class="form-group">
                <label class="label" for="filtro-unidad">Unidad</label>
                <select id="filtro-unidad" class="select" bind:value={filtros.unidad}>
                  <option value="">Todas las unidades</option>
                  {#each unidadesDisponibles as unidad}
                    <option value={unidad}>{unidad}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if mapeo?.estado}
              <div class="form-group">
                <label class="label" for="filtro-estado">Estado</label>
                <select id="filtro-estado" class="select" bind:value={filtros.estado}>
                  <option value="">Todos</option>
                  {#each estadosDisponibles as estado}
                    <option value={estado}>{estado}</option>
                  {/each}
                </select>
              </div>
            {/if}

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

        {#if resumenUnidades.length > 0}
          <div class="resumen-niveles">
            <h3>Resumen por unidad</h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Registros</th>
                    {#if mapeo?.sueldo}
                      <th>Sueldo promedio</th>
                    {/if}
                    {#if mapeo?.estado}
                      <th>Pendientes</th>
                    {/if}
                  </tr>
                </thead>
                <tbody>
                  {#each resumenUnidades as item}
                    <tr>
                      <td><strong>{item.unidad}</strong></td>
                      <td>{item.registros}</td>
                      {#if mapeo?.sueldo}
                        <td>{item.sueldoPromedio > 0 ? formatearMoneda(item.sueldoPromedio) : '—'}</td>
                      {/if}
                      {#if mapeo?.estado}
                        <td>{item.pendientes > 0 ? item.pendientes : '—'}</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

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
          No se detectaron columnas reconocibles. Usa hojas como <strong>Sueldos por Unidad</strong> (Colaborador, Unidad) o <strong>Mapa Unidades</strong> (Cliente, Unidad).
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
  .ejemplo-descarga,
  .columnas-preview {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .link-descarga {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: underline;
  }

  .tipo-hoja-badge {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.2rem 0.6rem;
    background: rgba(79, 70, 229, 0.12);
    color: var(--color-primary);
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
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

  .selector-hojas {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
  }

  .hoja-preview {
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .hoja-preview p {
    margin-bottom: 0.35rem;
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

  .alert-info {
    padding: 0.875rem 1rem;
    border-radius: var(--radius);
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
    font-size: 0.9rem;
  }

  .alert-info a {
    font-weight: 600;
  }
</style>
