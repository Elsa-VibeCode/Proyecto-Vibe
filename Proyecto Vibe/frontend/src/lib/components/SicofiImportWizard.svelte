<script lang="ts">
  import { api, apiSubirArchivo } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import { formatearFecha } from '$lib/utils';
  import Modal from '$lib/components/Modal.svelte';
  import type {
    BadgeSicofi,
    EstrategiaDuplicados,
    SicofiDefaults,
    SicofiImportResponse,
    SicofiMapping,
    SicofiPreviewFila,
    SicofiPreviewResponse,
  } from '$lib/types/sicofi';
  import {
    CAMPOS_MAPPING_UI,
    cargarMappingSicofiGuardado,
    guardarMappingSicofi,
  } from '$lib/types/sicofi';

  interface Props {
    abierto: boolean;
    onCerrar: () => void;
    onCompletado: (resumen: SicofiImportResponse['data']) => void;
  }

  let { abierto, onCerrar, onCompletado }: Props = $props();

  let paso = $state(1);
  let error = $state('');
  let procesando = $state(false);
  let progreso = $state('');
  let nombreArchivo = $state('');
  let csvBase64 = $state('');
  let columnas = $state<string[]>([]);
  let delimitador = $state(',');
  let encoding = $state('');
  let primeras5 = $state<Record<string, string>[]>([]);
  let mapping = $state<SicofiMapping | null>(null);
  let defaults = $state<SicofiDefaults>({
    fechaPago: 'vacio',
    estatusPago: 'PENDIENTE',
    rfcEmisor: 'GBL',
    unidad: 'auto',
    concepto: 'columna',
    conceptoFijo: 'Servicios profesionales',
  });
  let previewFilas = $state<SicofiPreviewFila[]>([]);
  let contadores = $state<Record<string, number>>({});
  let totalFilas = $state(0);
  let previewLimitado = $state(false);
  let filtroBadge = $state<BadgeSicofi | ''>('');
  let estrategiaDuplicados = $state<EstrategiaDuplicados>('ignorar');
  let logErrores = $state<{ fila: number; mensaje: string }[]>([]);
  let mostrarLog = $state(false);

  const BADGE_LABELS: Record<string, string> = {
    NUEVA: '🟢 NUEVA',
    DUPLICADO: '🟡 DUPLICADO',
    SIN_CLASIFICAR: '🟠 SIN CLASIFICAR',
    ERROR: '🔴 ERROR',
  };

  function resetWizard() {
    paso = 1;
    error = '';
    procesando = false;
    progreso = '';
    nombreArchivo = '';
    csvBase64 = '';
    columnas = [];
    delimitador = ',';
    encoding = '';
    primeras5 = [];
    mapping = null;
    defaults = {
      fechaPago: 'vacio',
      estatusPago: 'PENDIENTE',
      rfcEmisor: 'GBL',
      unidad: 'auto',
      concepto: 'columna',
      conceptoFijo: 'Servicios profesionales',
    };
    previewFilas = [];
    contadores = {};
    totalFilas = 0;
    previewLimitado = false;
    filtroBadge = '';
    estrategiaDuplicados = 'ignorar';
    logErrores = [];
    mostrarLog = false;
  }

  function cerrar() {
    resetWizard();
    onCerrar();
  }

  async function subirCsv(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const nombre = file.name.toLowerCase();
    const okExt = /\.(csv|txt|xlsx|xls)$/i.test(nombre);
    if (!okExt) {
      error = 'Formato no soportado. Sube un CSV o Excel (.csv, .xlsx, .xls) exportado desde Sicofi.';
      input.value = '';
      return;
    }

    error = '';
    procesando = true;
    progreso = 'Leyendo archivo...';
    nombreArchivo = file.name;

    try {
      const guardado = cargarMappingSicofiGuardado();
      const resp = await apiSubirArchivo<SicofiPreviewResponse>(
        '/facturas/preview-sicofi',
        file,
        'archivo',
        guardado
          ? {
              mapping: JSON.stringify(guardado.mapping),
              defaults: JSON.stringify(guardado.defaults),
            }
          : undefined
      );

      if (!resp.ok || !resp.data) throw new Error('Respuesta inválida del servidor');

      csvBase64 = resp.data.csvBase64;
      columnas = resp.data.columnasDetectadas;
      delimitador = resp.data.delimitador;
      encoding = resp.data.encoding;
      primeras5 = resp.data.primeras5Filas;
      mapping = guardado?.mapping ?? resp.data.mapping;
      defaults = guardado?.defaults ?? resp.data.defaults;
      totalFilas = resp.data.totalFilas;
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo leer el CSV';
    } finally {
      procesando = false;
      progreso = '';
      input.value = '';
    }
  }

  function ejemploColumna(col: string | null): string {
    if (!col || !primeras5[0]) return '—';
    const val = primeras5[0][col];
    return val !== undefined && val !== '' ? String(val) : '—';
  }

  function opcionesColumna(ignorar = true): { value: string; label: string }[] {
    const opts = columnas.map((c) => ({ value: c, label: c }));
    if (ignorar) opts.unshift({ value: '', label: '(Ignorar)' });
    return opts;
  }

  function actualizarMapping(campo: keyof SicofiMapping, valor: string) {
    if (!mapping) return;
    mapping = { ...mapping, [campo]: valor || null };
    if (campo === 'serie' || campo === 'folio') {
      if (mapping.serie && mapping.folio) {
        mapping.noFacturaTipo = 'serie_folio';
        mapping.noFactura = `${mapping.serie} + ${mapping.folio}`;
      } else if (mapping.folio) {
        mapping.noFacturaTipo = 'columna';
        mapping.noFactura = mapping.folio;
      }
    }
  }

  async function cargarPreview(pasoDestino: number, limitePreview = '500') {
    if (!csvBase64 || !mapping) return;
    error = '';
    procesando = true;
    progreso = limitePreview === 'all' ? 'Generando vista previa completa...' : 'Analizando filas...';

    try {
      const resp = await api<SicofiPreviewResponse>('/facturas/preview-sicofi', {
        method: 'POST',
        body: JSON.stringify({
          csvBase64,
          nombreArchivo,
          mapping,
          defaults,
          limitePreview,
        }),
      });

      if (!resp.ok || !resp.data) throw new Error('No se pudo generar la vista previa');

      previewFilas = resp.data.preview;
      contadores = resp.data.contadores;
      totalFilas = resp.data.totalFilas;
      previewLimitado = resp.data.previewLimitado;
      paso = pasoDestino;
      guardarMappingSicofi(mapping, defaults);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error en vista previa';
    } finally {
      procesando = false;
      progreso = '';
    }
  }

  async function confirmarImportacion() {
    if (!csvBase64 || !mapping) return;
    error = '';
    procesando = true;
    progreso =
      totalFilas > 1000
        ? `Importando 0/${totalFilas}...`
        : 'Importando facturas...';

    try {
      const resp = await api<SicofiImportResponse>('/facturas/import-sicofi', {
        method: 'POST',
        body: JSON.stringify({
          csvBase64,
          mapping,
          defaults,
          estrategiaDuplicados,
          nombreArchivo,
        }),
      });

      if (!resp.ok || !resp.data) throw new Error('Importación fallida');

      logErrores = resp.data.errores ?? [];
      onCompletado(resp.data);
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al importar';
    } finally {
      procesando = false;
      progreso = '';
    }
  }

  let filasFiltradas = $derived(
    filtroBadge
      ? previewFilas.filter((f) => f.badge === filtroBadge)
      : previewFilas
  );

  let resumenContadores = $derived(
    `${contadores.NUEVA ?? 0} nuevas · ${contadores.DUPLICADO ?? 0} duplicadas · ${contadores.SIN_CLASIFICAR ?? 0} sin clasificar · ${contadores.ERROR ?? 0} con errores`
  );

  function puedeContinuarPaso1(): boolean {
    return Boolean(csvBase64 && columnas.length >= 3 && primeras5.length > 0 && !error);
  }

  function conceptoResuelto(): boolean {
    if (mapping?.concepto) return true;
    return defaults.concepto === 'fijo' || defaults.concepto === 'folio';
  }

  let camposMappingFaltantes = $derived.by(() => {
    if (!mapping) return [] as string[];
    const faltan: string[] = [];
    if (!mapping.fechaFacturacion) faltan.push('Fecha de facturación');
    if (!mapping.folio) faltan.push('Folio');
    if (!mapping.cliente) faltan.push('Cliente');
    if (!conceptoResuelto()) faltan.push('Concepto (columna o valor por defecto)');
    if (!mapping.subtotal) faltan.push('Subtotal');
    return faltan;
  });

  function puedeContinuarPaso2(): boolean {
    return Boolean(
      mapping?.fechaFacturacion &&
        mapping?.folio &&
        mapping?.cliente &&
        conceptoResuelto() &&
        mapping?.subtotal
    );
  }
</script>

<Modal abierto={abierto} titulo="Importar desde Sicofi" onCerrar={cerrar} anchura="920px">
  <div class="wizard">
    <nav class="pasos" aria-label="Pasos del asistente">
      <span class:active={paso === 1} class:done={paso > 1}>1. Upload</span>
      <span class="sep">›</span>
      <span class:active={paso === 2} class:done={paso > 2}>2. Mapping</span>
      <span class="sep">›</span>
      <span class:active={paso === 3}>3. Preview</span>
    </nav>

    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    {#if procesando}
      <p class="progreso">{progreso || 'Procesando...'}</p>
    {/if}

    {#if paso === 1}
      <section class="paso-contenido">
        <p class="ayuda">
          Exporta CFDIs emitidos desde <strong>cfd.sicofi.com.mx</strong> en CSV o Excel y súbelo aquí.
          Si Sicofi te da .xlsx, también funciona.
        </p>
        <label class="upload-zone">
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onchange={subirCsv}
            disabled={procesando}
          />
          {#if nombreArchivo}
            <span class="archivo-nombre">{nombreArchivo} · {totalFilas} filas</span>
          {:else}
            <span>Seleccionar CSV o Excel (.csv, .xlsx, .xls)</span>
          {/if}
        </label>

        {#if columnas.length}
          <div class="meta-csv">
            <span>Encoding: <strong>{encoding}</strong></span>
            <span>Separador: <strong>{delimitador === ';' ? 'punto y coma (;)' : 'coma (,)'}</strong></span>
            <span>{columnas.length} columnas</span>
          </div>

          <h3>Vista previa (5 primeras filas)</h3>
          <div class="tabla-scroll">
            <table>
              <thead>
                <tr>
                  {#each columnas as col}
                    <th>{col}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each primeras5 as fila}
                  <tr>
                    {#each columnas as col}
                      <td>{fila[col] ?? ''}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {:else if paso === 2 && mapping}
      <section class="paso-contenido">
        <p class="ayuda">
          Confirma o ajusta el mapeo de columnas. Los valores de ejemplo provienen de la primera fila del CSV.
        </p>

        {#if camposMappingFaltantes.length}
          <div class="alert alert-warning">
            <strong>Faltan campos obligatorios:</strong> {camposMappingFaltantes.join(' · ')}
          </div>
        {/if}

        <div class="mapping-grid">
          {#each CAMPOS_MAPPING_UI as campo}
            {@const falta =
              campo.requerido &&
              ((campo.key === 'concepto' && !conceptoResuelto()) ||
                (campo.key !== 'concepto' && !mapping[campo.key]))}
            <label class:falta>
              <span class="label-text">
                {campo.label}
                {#if campo.requerido}<em>*</em>{/if}
              </span>
              <select
                value={mapping[campo.key] ?? ''}
                onchange={(e) => actualizarMapping(campo.key, (e.target as HTMLSelectElement).value)}
              >
                {#each opcionesColumna(true) as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
              <span class="ejemplo">Ej: {ejemploColumna(mapping[campo.key])}</span>
            </label>
          {/each}
        </div>

        <h3>Valores por defecto (campos sin columna directa)</h3>
        <div class="defaults-grid">
          <label>
            <span class="label-text">fechaPago</span>
            <select bind:value={defaults.fechaPago}>
              <option value="vacio">Dejar vacío</option>
              <option value="fechaFacturacion">Usar Fecha de emisión</option>
            </select>
          </label>
          <label>
            <span class="label-text">estatusPago</span>
            <select bind:value={defaults.estatusPago}>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="PAGADO">PAGADO</option>
              <option value="metodo_pago">Usar Método de pago (PUE/PPD)</option>
            </select>
          </label>
          <label>
            <span class="label-text">rfcEmisor</span>
            <select bind:value={defaults.rfcEmisor}>
              <option value="GBL">GBL (default)</option>
              <option value="GAVM">GAVM</option>
              <option value="columna">Mapear desde columna RFC emisor</option>
            </select>
          </label>
          <label>
            <span class="label-text">unidad</span>
            <select bind:value={defaults.unidad}>
              <option value="auto">Auto-clasificar por cliente</option>
              <option value="vacia">Dejar vacía</option>
            </select>
          </label>
          <label>
            <span class="label-text">concepto (si no hay columna)</span>
            <select bind:value={defaults.concepto}>
              <option value="columna">Usar columna mapeada arriba</option>
              <option value="fijo">Texto fijo para todas las filas</option>
              <option value="folio">Usar «Factura» + folio</option>
            </select>
          </label>
          {#if defaults.concepto === 'fijo'}
            <label>
              <span class="label-text">Texto del concepto</span>
              <input type="text" bind:value={defaults.conceptoFijo} placeholder="Servicios profesionales" />
            </label>
          {/if}
        </div>
      </section>
    {:else if paso === 3}
      <section class="paso-contenido">
        <div class="preview-header">
          <p><strong>{resumenContadores}</strong></p>
          {#if previewLimitado}
            <p class="aviso">Vista previa limitada a 500 filas; el import procesará las {totalFilas} filas.</p>
          {/if}
        </div>

        <div class="filtros-badge">
          <button type="button" class:active={!filtroBadge} onclick={() => (filtroBadge = '')}>Todas</button>
          {#each Object.entries(BADGE_LABELS) as [key, label]}
            <button
              type="button"
              class:active={filtroBadge === key}
              onclick={() => (filtroBadge = key as BadgeSicofi)}
            >
              {label} ({contadores[key] ?? 0})
            </button>
          {/each}
        </div>

        <label class="estrategia">
          <span class="label-text">Estrategia para duplicados</span>
          <select bind:value={estrategiaDuplicados}>
            <option value="ignorar">Ignorar duplicados</option>
            <option value="actualizarVacios">Actualizar campos vacíos</option>
            <option value="sobrescribir">Sobrescribir completo</option>
          </select>
        </label>

        <div class="tabla-scroll preview-tabla">
          <table>
            <thead>
              <tr>
                <th>Fila</th>
                <th>Estado</th>
                <th>Folio</th>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Total</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {#each filasFiltradas as fila}
                <tr class={`badge-${fila.badge}`}>
                  <td>{fila.fila}</td>
                  <td>
                    <span class="badge">{BADGE_LABELS[fila.badge] ?? fila.badge}</span>
                    {#if fila.mensaje}
                      <small>{fila.mensaje}</small>
                    {/if}
                  </td>
                  <td>{fila.noFactura ?? '—'}</td>
                  <td>{fila.cliente ?? '—'}</td>
                  <td>{fila.concepto ?? '—'}</td>
                  <td>{fila.total != null ? formatearMoneda(fila.total) : '—'}</td>
                  <td>{fila.unidad ?? (fila.sinClasificar ? 'Sin clasificar' : '—')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <footer class="wizard-footer">
      {#if paso > 1}
        <button type="button" class="btn btn-secondary" disabled={procesando} onclick={() => (paso -= 1)}>
          Atrás
        </button>
      {:else}
        <span></span>
      {/if}

      <div class="footer-derecha">
        <button type="button" class="btn btn-secondary" onclick={cerrar}>Cancelar</button>
        {#if paso === 1}
          <button
            type="button"
            class="btn btn-primary"
            disabled={!puedeContinuarPaso1() || procesando}
            onclick={() => (paso = 2)}
          >
            Continuar
          </button>
        {:else if paso === 2}
          <button
            type="button"
            class="btn btn-primary"
            disabled={!puedeContinuarPaso2() || procesando}
            title={camposMappingFaltantes.length ? `Completa: ${camposMappingFaltantes.join(', ')}` : ''}
            onclick={() => cargarPreview(3, 'all')}
          >
            Ver preview
          </button>
        {:else}
          <button
            type="button"
            class="btn btn-primary"
            disabled={procesando || (contadores.NUEVA ?? 0) + (contadores.DUPLICADO ?? 0) === 0}
            onclick={confirmarImportacion}
          >
            {procesando ? 'Importando...' : 'Confirmar importación'}
          </button>
        {/if}
      </div>
    </footer>
  </div>
</Modal>

<style>
  .wizard {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 420px;
  }

  .pasos {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }

  .pasos span.active {
    color: var(--color-primary, #2563eb);
    font-weight: 600;
  }

  .pasos span.done {
    color: #166534;
  }

  .sep {
    opacity: 0.4;
  }

  .paso-contenido {
    flex: 1;
  }

  .ayuda {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .upload-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--color-border);
    border-radius: 8px;
    padding: 2rem;
    cursor: pointer;
    margin-bottom: 1rem;
  }

  .upload-zone input {
    display: none;
  }

  .archivo-nombre {
    font-weight: 600;
  }

  .meta-csv {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .tabla-scroll {
    overflow: auto;
    max-height: 280px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  .preview-tabla {
    max-height: 340px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th,
  td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    white-space: nowrap;
  }

  th {
    background: var(--color-bg);
    position: sticky;
    top: 0;
  }

  .mapping-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .defaults-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .label-text {
    font-size: 0.82rem;
    font-weight: 500;
  }

  .ejemplo {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  select {
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    font-size: 0.85rem;
  }

  .preview-header {
    margin-bottom: 0.75rem;
  }

  .aviso {
    font-size: 0.82rem;
    color: #b45309;
  }

  .filtros-badge {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }

  .filtros-badge button {
    font-size: 0.78rem;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: white;
  }

  .filtros-badge button.active {
    background: #dbeafe;
    border-color: #93c5fd;
  }

  .estrategia {
    margin-bottom: 0.75rem;
    max-width: 320px;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
  }

  tr.badge-ERROR {
    background: #fef2f2;
  }

  tr.badge-DUPLICADO {
    background: #fefce8;
  }

  .wizard-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .footer-derecha {
    display: flex;
    gap: 0.5rem;
  }

  .progreso {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .alert-error {
    background: #fef2f2;
    color: #b91c1c;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
    font-size: 0.88rem;
  }

  .alert-warning {
    background: #fffbeb;
    color: #92400e;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
    font-size: 0.88rem;
    margin-bottom: 0.75rem;
  }

  label.falta select {
    border-color: #f87171;
    background: #fef2f2;
  }

  .defaults-grid input[type='text'] {
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    font-size: 0.85rem;
  }
</style>
