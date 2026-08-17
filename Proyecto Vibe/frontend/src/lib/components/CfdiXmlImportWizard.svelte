<script lang="ts">
  import { apiSubirArchivos } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import { formatearFecha } from '$lib/utils';
  import Modal from '$lib/components/Modal.svelte';

  type Badge = 'NUEVA' | 'DUPLICADO' | 'SIN_CLASIFICAR' | 'SIN_FACTURA' | 'ERROR' | 'OMITIDA';
  type Estrategia = 'ignorar' | 'actualizarVacios' | 'sobrescribir';

  interface CfdiFila {
    archivo: string;
    tipoXml?: 'factura' | 'complemento';
    badge: Badge;
    mensaje?: string;
    noFactura: string;
    cliente: string;
    concepto: string;
    subtotal: number;
    iva: number;
    total: number;
    fechaFacturacion: string;
    rfcEmisor: string;
    unidad: string | null;
    uuid?: string;
    metodoPago?: string;
    estatusPago?: string;
    meta?: { rfcEmisorRaw?: string; nombreEmisor?: string };
  }

  interface PreviewData {
    totalArchivos: number;
    totalValidas: number;
    contadores: Record<string, number>;
    filas: CfdiFila[];
    errores: { archivo: string; mensaje: string }[];
  }

  interface ImportData {
    creadas: number;
    actualizadas: number;
    ignoradas: number;
    sinClasificar: number;
    complementosCreados?: number;
    complementosIgnorados?: number;
    errores: { fila: number; archivo?: string; mensaje: string }[];
  }

  interface Props {
    abierto: boolean;
    onCerrar: () => void;
    onCompletado: (resumen: ImportData) => void;
  }

  let { abierto, onCerrar, onCompletado }: Props = $props();

  let error = $state('');
  let procesando = $state(false);
  let archivos = $state<File[]>([]);
  let preview = $state<PreviewData | null>(null);
  let estrategiaDuplicados = $state<Estrategia>('ignorar');
  let rfcEmisor = $state<'auto' | 'GAVM' | 'GBL' | 'OTRO'>('auto');
  let unidad = $state<'auto' | 'Technologies' | 'Consulting' | 'Grupo' | 'vacia'>('auto');
  let filtroBadge = $state<Badge | ''>('');

  const BADGE_LABELS: Record<Badge, string> = {
    NUEVA: 'Nueva',
    DUPLICADO: 'Duplicado',
    SIN_CLASIFICAR: 'Sin clasificar',
    SIN_FACTURA: 'Sin factura',
    ERROR: 'Error',
    OMITIDA: 'Omitida',
  };

  function resetWizard() {
    error = '';
    procesando = false;
    archivos = [];
    preview = null;
    estrategiaDuplicados = 'ignorar';
    rfcEmisor = 'auto';
    unidad = 'auto';
    filtroBadge = '';
  }

  function cerrar() {
    resetWizard();
    onCerrar();
  }

  function defaultsPayload() {
    return JSON.stringify({
      rfcEmisor,
      unidad,
      estatusPago: 'PENDIENTE',
    });
  }

  async function onSeleccionar(e: Event) {
    const input = e.target as HTMLInputElement;
    const lista = Array.from(input.files ?? []);
    input.value = '';

    const xmls = lista.filter((f) => /\.xml$/i.test(f.name));
    const ignorados = lista.length - xmls.length;
    if (!xmls.length) {
      error = 'Selecciona archivos .xml (el PDF no se importa; el XML ya trae los datos del CFDI).';
      return;
    }

    error = ignorados
      ? `Se ignoraron ${ignorados} archivo(s) que no son XML (p. ej. PDF).`
      : '';
    archivos = xmls;
    preview = null;
    procesando = true;

    try {
      const resp = await apiSubirArchivos<{ ok: boolean; data: PreviewData }>(
        '/facturas/preview-cfdi-xml',
        xmls,
        'archivos',
        { defaults: defaultsPayload() }
      );
      if (!resp.ok || !resp.data) throw new Error('Respuesta inválida del servidor');
      preview = resp.data;
      if (!resp.data.filas.length && resp.data.errores.length) {
        error =
          resp.data.errores
            .slice(0, 3)
            .map((e) => `${e.archivo}: ${e.mensaje}`)
            .join(' · ') || 'Ningún XML pudo parsearse';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudieron leer los XML';
      preview = null;
    } finally {
      procesando = false;
    }
  }

  async function refrescarPreview() {
    if (!archivos.length) return;
    procesando = true;
    error = '';
    try {
      const resp = await apiSubirArchivos<{ ok: boolean; data: PreviewData }>(
        '/facturas/preview-cfdi-xml',
        archivos,
        'archivos',
        { defaults: defaultsPayload() }
      );
      if (!resp.ok || !resp.data) throw new Error('Respuesta inválida del servidor');
      preview = resp.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo refrescar el preview';
    } finally {
      procesando = false;
    }
  }

  async function importar() {
    if (!archivos.length || !preview?.filas.length) return;
    procesando = true;
    error = '';
    try {
      const resp = await apiSubirArchivos<{ ok: boolean; data: ImportData }>(
        '/facturas/import-cfdi-xml',
        archivos,
        'archivos',
        {
          defaults: defaultsPayload(),
          estrategiaDuplicados,
        }
      );
      if (!resp.ok || !resp.data) throw new Error('Respuesta inválida del servidor');
      onCompletado(resp.data);
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo importar';
    } finally {
      procesando = false;
    }
  }

  const filasVisibles = $derived(
    !preview
      ? []
      : filtroBadge
        ? preview.filas.filter((f) => f.badge === filtroBadge)
        : preview.filas
  );
</script>

<Modal abierto={abierto} titulo="Importar XML CFDI (factura y complemento)" anchura="960px" onCerrar={cerrar}>
  <div class="wizard">
    <p class="ayuda">
      Sube los <strong>XML</strong> de factura (tipo I) y, si aplica, los de
      <strong>complemento de pago</strong> (tipo P / REP). Puedes seleccionar ambos en el mismo lote:
      las PPD quedan pagadas al importar el complemento; las PUE se marcan pagadas con la fecha del CFDI.
      Los PDF no se importan.
    </p>

    <div class="fila-controles">
      <label class="btn btn-secondary file-btn">
        {procesando ? 'Procesando…' : 'Elegir XML…'}
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          disabled={procesando}
          onchange={onSeleccionar}
        />
      </label>
      {#if archivos.length}
        <span class="meta">{archivos.length} XML seleccionado(s)</span>
      {/if}
    </div>

    <div class="defaults">
      <label>
        Emisor
        <select
          class="select"
          bind:value={rfcEmisor}
          onchange={() => void refrescarPreview()}
          disabled={!archivos.length || procesando}
        >
          <option value="auto">Auto (según RFC del XML)</option>
          <option value="GAVM">Forzar GAVM</option>
          <option value="GBL">Forzar GBL</option>
          <option value="OTRO">Forzar OTRO</option>
        </select>
      </label>
      <label>
        Unidad
        <select
          class="select"
          bind:value={unidad}
          onchange={() => void refrescarPreview()}
          disabled={!archivos.length || procesando}
        >
          <option value="auto">Auto (mapa / historial)</option>
          <option value="Technologies">Technologies</option>
          <option value="Consulting">Consulting</option>
          <option value="Grupo">Grupo</option>
          <option value="vacia">Dejar sin clasificar</option>
        </select>
      </label>
      <label>
        Duplicados
        <select class="select" bind:value={estrategiaDuplicados} disabled={procesando}>
          <option value="ignorar">Ignorar</option>
          <option value="actualizarVacios">Actualizar vacíos</option>
          <option value="sobrescribir">Sobrescribir</option>
        </select>
      </label>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if preview}
      <div class="contadores">
        {#each Object.entries(preview.contadores) as [badge, n]}
          {#if n}
            <button
              type="button"
              class="chip"
              class:activo={filtroBadge === badge}
              onclick={() => (filtroBadge = filtroBadge === badge ? '' : (badge as Badge))}
            >
              {BADGE_LABELS[badge as Badge] ?? badge}: {n}
            </button>
          {/if}
        {/each}
        {#if filtroBadge}
          <button type="button" class="chip" onclick={() => (filtroBadge = '')}>Ver todas</button>
        {/if}
      </div>

      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Emisor</th>
              <th>Unidad</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {#each filasVisibles as fila}
              <tr>
                <td class="mono" title={fila.archivo}>{fila.archivo}</td>
                <td>{fila.tipoXml === 'complemento' ? 'Complemento' : 'Factura'}</td>
                <td>
                  <span class={`badge badge-${fila.badge}`}>{BADGE_LABELS[fila.badge]}</span>
                  {#if fila.mensaje}<span class="msg">{fila.mensaje}</span>{/if}
                </td>
                <td class="mono">{fila.noFactura}</td>
                <td>{fila.cliente}</td>
                <td>{formatearFecha(fila.fechaFacturacion)}</td>
                <td>
                  {fila.rfcEmisor}
                  {#if fila.meta?.rfcEmisorRaw}
                    <span class="meta-rfc">{fila.meta.rfcEmisorRaw}</span>
                  {/if}
                </td>
                <td>{fila.unidad ?? '—'}</td>
                <td class="num">{formatearMoneda(fila.total)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if preview.errores.length}
        <details class="errores-detalle">
          <summary>{preview.errores.length} archivo(s) con error</summary>
          <ul>
            {#each preview.errores as err}
              <li><strong>{err.archivo}</strong>: {err.mensaje}</li>
            {/each}
          </ul>
        </details>
      {/if}

      <div class="acciones">
        <button type="button" class="btn btn-secondary" onclick={cerrar} disabled={procesando}>
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={procesando || !preview.filas.length}
          onclick={() => void importar()}
        >
          {procesando ? 'Importando…' : `Importar ${preview.filas.length} XML`}
        </button>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .wizard {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .ayuda {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--texto-secundario, #555);
  }
  .fila-controles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .file-btn {
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  .file-btn input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .meta {
    font-size: 0.85rem;
    color: var(--texto-secundario, #666);
  }
  .defaults {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
  }
  .defaults label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
  }
  .defaults .select {
    min-width: 11rem;
  }
  .error {
    margin: 0;
    color: #b42318;
    font-size: 0.875rem;
  }
  .contadores {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    border: 1px solid #d0d5dd;
    background: #fff;
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .chip.activo {
    border-color: #344054;
    background: #f2f4f7;
  }
  .tabla-wrap {
    max-height: 320px;
    overflow: auto;
    border: 1px solid #e4e7ec;
    border-radius: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    padding: 0.45rem 0.55rem;
    border-bottom: 1px solid #f0f2f5;
    text-align: left;
    vertical-align: top;
  }
  th {
    position: sticky;
    top: 0;
    background: #f9fafb;
    z-index: 1;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .num {
    text-align: right;
    white-space: nowrap;
  }
  .meta-rfc {
    display: block;
    font-size: 0.7rem;
    color: #667085;
  }
  .badge {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .badge-NUEVA {
    background: #dcfae6;
    color: #067647;
  }
  .badge-DUPLICADO {
    background: #fef0c7;
    color: #b54708;
  }
  .badge-SIN_CLASIFICAR {
    background: #ffead5;
    color: #b93815;
  }
  .badge-SIN_FACTURA {
    background: #fee4e2;
    color: #b42318;
  }
  .msg {
    display: block;
    font-size: 0.7rem;
    color: #667085;
  }
  .errores-detalle {
    font-size: 0.85rem;
  }
  .errores-detalle ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
  }
  .acciones {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
