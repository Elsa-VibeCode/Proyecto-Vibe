<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, apiSubirArchivo } from '$lib/api';
  import { formatearMoneda, formatearFecha } from '$lib/utils';
  import type { RepPreviewFila } from '$lib/types/complementos';
  import type { RepImportResponse, RepPreviewResponse } from '$lib/types/complementos';

  const BADGE_LABELS: Record<string, string> = {
    NUEVO: '🟢 Nuevo',
    DUPLICADO: '🟡 Duplicado',
    SIN_FACTURA: '🟠 Sin factura',
    ERROR: '🔴 Error',
  };

  let nombreArchivo = $state('');
  let csvBase64 = $state('');
  let previewFilas = $state<RepPreviewFila[]>([]);
  let contadores = $state<Record<string, number>>({});
  let totalFilas = $state(0);
  let seleccion = $state<Set<number>>(new Set());
  let cargandoPreview = $state(false);
  let importando = $state(false);
  let error = $state('');
  let mensaje = $state('');

  async function subirArchivo(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    error = '';
    mensaje = '';
    cargandoPreview = true;
    nombreArchivo = file.name;

    try {
      const resp = await apiSubirArchivo<RepPreviewResponse>(
        '/complementos/preview-sicofi',
        file
      );
      if (!resp.ok || !resp.data) throw new Error('Respuesta inválida del servidor');

      previewFilas = resp.data.preview ?? [];
      contadores = resp.data.contadores ?? {};
      totalFilas = resp.data.totalFilas ?? 0;

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      csvBase64 = btoa(binary);

      seleccion = new Set(
        previewFilas.filter((f) => f.badge === 'NUEVO').map((f) => f.fila)
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo procesar el archivo';
      previewFilas = [];
    } finally {
      cargandoPreview = false;
      input.value = '';
    }
  }

  function toggleFila(fila: number) {
    const next = new Set(seleccion);
    if (next.has(fila)) next.delete(fila);
    else next.add(fila);
    seleccion = next;
  }

  function seleccionarTodosNuevos() {
    seleccion = new Set(previewFilas.filter((f) => f.badge === 'NUEVO').map((f) => f.fila));
  }

  async function importar() {
    if (!csvBase64) {
      error = 'Sube un archivo CSV de Sicofi primero';
      return;
    }
    if (seleccion.size === 0) {
      error = 'Selecciona al menos una fila para importar';
      return;
    }

    importando = true;
    error = '';
    mensaje = '';

    try {
      const res = await api<RepImportResponse>('/complementos/import-sicofi', {
        method: 'POST',
        body: JSON.stringify({
          csvBase64,
          nombreArchivo,
          filasSeleccionadas: [...seleccion],
        }),
      });

      const data = res.data;
      mensaje = `Importación completada: ${data.importados} complementos creados, ${data.omitidos} omitidos.`;
      if (data.alertas?.length) {
        mensaje += ` ${data.alertas.length} alerta(s).`;
      }
      if (data.importados > 0) {
        setTimeout(() => goto('/complementos'), 1500);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al importar';
    } finally {
      importando = false;
    }
  }

  function fechaPreview(valor?: string): string {
    if (!valor) return '—';
    return formatearFecha(valor);
  }
</script>

<svelte:head>
  <title>Importar REP Sicofi — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Importar complementos desde Sicofi</h1>
      <p>
        Sube el export de Sicofi: <strong>Reporte Pagos</strong> o <strong>recepción de pagos</strong>
        (.xlsx/.csv), o listado CFDI tipo P.
      </p>
    </div>
    <a href="/complementos" class="btn btn-secondary">← Volver al listado</a>
  </header>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <section class="card upload-section">
    <label class="label" for="rep-file">Archivo CSV / Excel</label>
    <input
      id="rep-file"
      type="file"
      accept=".csv,.txt,.xlsx,.xls"
      onchange={subirArchivo}
      disabled={cargandoPreview}
    />
    {#if cargandoPreview}
      <p class="hint">Analizando archivo...</p>
    {:else if nombreArchivo}
      <p class="hint">Archivo: {nombreArchivo} · {totalFilas} filas en total</p>
    {/if}
  </section>

  {#if Object.keys(contadores).length > 0}
    <div class="contadores card">
      {#each Object.entries(contadores) as [clave, valor]}
        <span class="chip">{clave}: {valor}</span>
      {/each}
    </div>
  {/if}

  {#if previewFilas.length > 0}
    <section class="card tabla-section">
      <div class="tabla-header">
        <h2>Vista previa ({previewFilas.length} filas)</h2>
        <div class="tabla-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick={seleccionarTodosNuevos}>
            Seleccionar nuevos
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={importando || seleccion.size === 0}
            onclick={importar}
          >
            {importando ? 'Importando...' : `Importar (${seleccion.size})`}
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Fila</th>
              <th>Estado</th>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Fecha pago</th>
              <th class="num">Monto</th>
              <th>Factura rel.</th>
            </tr>
          </thead>
          <tbody>
            {#each previewFilas as fila}
              <tr class:fila-error={fila.badge === 'ERROR'}>
                <td>
                  {#if fila.badge === 'NUEVO' || fila.badge === 'SIN_FACTURA'}
                    <input
                      type="checkbox"
                      checked={seleccion.has(fila.fila)}
                      onchange={() => toggleFila(fila.fila)}
                    />
                  {/if}
                </td>
                <td>{fila.fila}</td>
                <td>
                  <span class="badge badge-{fila.badge?.toLowerCase()}">
                    {BADGE_LABELS[fila.badge] ?? fila.badge}
                  </span>
                  {#if fila.mensaje}
                    <span class="msg-error">{fila.mensaje}</span>
                  {/if}
                </td>
                <td>{fila.folio || '—'}</td>
                <td>{fila.cliente || '—'}</td>
                <td>{fechaPreview(fila.fechaPago)}</td>
                <td class="num">{fila.monto != null ? formatearMoneda(fila.monto) : '—'}</td>
                <td>{fila.noFacturaRel || fila.uuidFacturaRel?.slice(0, 8) || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="hint footer-hint">
        Solo se importan filas tipo P marcadas como NUEVO con factura relacionada en el sistema.
        Las filas SIN_FACTURA se omiten al importar si no hay match por UUID.
      </p>
    </section>
  {/if}
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .page-header h1 {
    font-size: 1.5rem;
    margin-bottom: 0.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .page-header .btn {
    text-decoration: none;
  }

  .upload-section {
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .contadores {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .chip {
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }

  .tabla-section {
    padding: 1rem;
  }

  .tabla-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .tabla-header h2 {
    font-size: 1rem;
    margin: 0;
  }

  .tabla-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .num {
    text-align: right;
    white-space: nowrap;
  }

  .hint {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }

  .footer-hint {
    margin-top: 0.75rem;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge-nuevo {
    color: #166534;
  }

  .badge-duplicado {
    color: #854d0e;
  }

  .badge-sin_factura {
    color: #c2410c;
  }

  .badge-error {
    color: #991b1b;
  }

  .fila-error {
    background: #fef2f2;
  }

  .msg-error {
    display: block;
    font-size: 0.72rem;
    color: #991b1b;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  .alert {
    margin-bottom: 1rem;
  }
</style>
