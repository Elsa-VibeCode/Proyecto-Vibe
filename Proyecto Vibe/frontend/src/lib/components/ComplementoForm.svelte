<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/utils';
  import type {
    ComplementoPayload,
    FacturaPpdDisponible,
    FacturaRelacionadaPayload,
    FormaPagoSat,
    MonedaComplemento,
    UnidadComplemento,
  } from '$lib/types/complementos';
  import {
    FORMAS_PAGO_SAT,
    MONEDAS_COMPLEMENTO,
    UNIDADES_COMPLEMENTO,
    type ApiResponse,
  } from '$lib/types/complementos';

  interface Props {
    facturaIdPreseleccionada?: string;
    guardando?: boolean;
    onGuardar: (datos: ComplementoPayload) => void | Promise<void>;
    onCancelar: () => void;
  }

  let {
    facturaIdPreseleccionada = '',
    guardando = false,
    onGuardar,
    onCancelar,
  }: Props = $props();

  const hoy = new Date().toISOString().slice(0, 10);

  let folio = $state('');
  let fechaEmision = $state(hoy);
  let fechaPago = $state(hoy);
  let monto = $state<number>(0);
  let moneda = $state<MonedaComplemento>('MXN');
  let formaPago = $state<FormaPagoSat>('03');
  let unidad = $state<UnidadComplemento | ''>('');
  let cliente = $state('');
  let observaciones = $state('');

  let facturasDisponibles = $state<FacturaPpdDisponible[]>([]);
  let seleccionadas = $state<Map<string, number>>(new Map());
  let cargandoFacturas = $state(false);
  let errorForm = $state('');

  const sumaImportes = $derived(
    [...seleccionadas.values()].reduce((acc, v) => acc + (Number(v) || 0), 0)
  );
  const sumaDifiere = $derived(Math.abs(sumaImportes - (Number(monto) || 0)) > 0.01);

  onMount(async () => {
    try {
      const res = await api<ApiResponse<{ folio: string }>>('/complementos/sugerir-folio');
      if (res.data?.folio) folio = res.data.folio;
    } catch {
      /* opcional */
    }
    await cargarFacturas();
  });

  async function cargarFacturas() {
    cargandoFacturas = true;
    try {
      const params = new URLSearchParams();
      if (cliente.trim()) params.set('cliente', cliente.trim());
      if (facturaIdPreseleccionada) params.set('facturaId', facturaIdPreseleccionada);
      const res = await api<ApiResponse<{ facturas: FacturaPpdDisponible[] }>>(
        `/complementos/facturas-disponibles?${params}`
      );
      facturasDisponibles = res.data?.facturas ?? [];

      if (facturaIdPreseleccionada && seleccionadas.size === 0) {
        const pre = facturasDisponibles.find((f) => f._id === facturaIdPreseleccionada);
        if (pre) {
          const saldo = saldoFactura(pre);
          seleccionadas = new Map([[pre._id, saldo]]);
          if (!cliente) cliente = pre.cliente;
          if (!unidad && pre.unidad) unidad = pre.unidad;
          if (!monto) monto = saldo;
        }
      }
    } catch (err) {
      errorForm = err instanceof Error ? err.message : 'No se pudieron cargar las facturas PPD';
    } finally {
      cargandoFacturas = false;
    }
  }

  function saldoFactura(f: FacturaPpdDisponible): number {
    if (f.saldoPendiente !== undefined) return f.saldoPendiente;
    return Math.max(0, (f.total || 0) - (f.montoPagado || 0));
  }

  function estaSeleccionada(id: string): boolean {
    return seleccionadas.has(id);
  }

  function toggleFactura(f: FacturaPpdDisponible) {
    const next = new Map(seleccionadas);
    if (next.has(f._id)) {
      next.delete(f._id);
    } else {
      next.set(f._id, saldoFactura(f));
      if (!cliente) cliente = f.cliente;
      if (!unidad && f.unidad) unidad = f.unidad;
    }
    seleccionadas = next;
    if (!monto || monto === 0) {
      monto = [...next.values()].reduce((acc, v) => acc + v, 0);
    }
  }

  function actualizarImporte(id: string, valor: number) {
    const next = new Map(seleccionadas);
    next.set(id, valor);
    seleccionadas = next;
  }

  async function onClienteBlur() {
    await cargarFacturas();
  }

  function validar(): string | null {
    if (!folio.trim()) return 'El folio es obligatorio';
    if (!fechaEmision) return 'La fecha de emisión es obligatoria';
    if (!fechaPago) return 'La fecha de pago es obligatoria';
    if (Number(monto) <= 0) return 'El monto debe ser mayor a cero';
    if (seleccionadas.size === 0) return 'Selecciona al menos una factura PPD';
    if (sumaDifiere) {
      return `La suma de importes (${formatearMoneda(sumaImportes)}) debe igualar el monto (${formatearMoneda(Number(monto))})`;
    }
    for (const [id, importe] of seleccionadas) {
      if (importe <= 0) return 'Cada importe pagado debe ser mayor a cero';
      const f = facturasDisponibles.find((x) => x._id === id);
      if (f && importe > saldoFactura(f) + 0.01) {
        return `El importe para ${f.noFactura} excede el saldo pendiente`;
      }
    }
    return null;
  }

  async function enviar() {
    errorForm = '';
    const err = validar();
    if (err) {
      errorForm = err;
      return;
    }

    const facturasRelacionadas: FacturaRelacionadaPayload[] = [...seleccionadas.entries()].map(
      ([facturaId, importePagado]) => ({ facturaId, importePagado: Number(importePagado) })
    );

    try {
      await onGuardar({
        folio: folio.trim(),
        fechaEmision,
        fechaPago,
        monto: Number(monto),
        moneda,
        formaPago,
        unidad: unidad || undefined,
        cliente: cliente.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        facturasRelacionadas,
      });
    } catch (err) {
      errorForm = err instanceof Error ? err.message : 'No se pudo guardar el complemento';
    }
  }

  function fechaCorta(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
  }
</script>

<form class="complemento-form" onsubmit={(e) => e.preventDefault()}>
  {#if errorForm}
    <div class="alert alert-error">{errorForm}</div>
  {/if}

  <div class="form-grid">
    <div class="form-group">
      <label class="label" for="cf-folio">Folio REP *</label>
      <input id="cf-folio" class="input" bind:value={folio} placeholder="GBL-P-0001" required />
    </div>

    <div class="form-group">
      <label class="label" for="cf-cliente">Cliente</label>
      <input
        id="cf-cliente"
        class="input"
        bind:value={cliente}
        onblur={onClienteBlur}
        placeholder="Filtra facturas PPD por cliente"
      />
    </div>

    <div class="form-group">
      <label class="label" for="cf-fecha-emision">Fecha emisión *</label>
      <input id="cf-fecha-emision" class="input" type="date" bind:value={fechaEmision} required />
    </div>

    <div class="form-group">
      <label class="label" for="cf-fecha-pago">Fecha pago *</label>
      <input id="cf-fecha-pago" class="input" type="date" bind:value={fechaPago} required />
    </div>

    <div class="form-group">
      <label class="label" for="cf-monto">Monto total *</label>
      <input
        id="cf-monto"
        class="input"
        type="number"
        min="0.01"
        step="0.01"
        bind:value={monto}
        required
      />
    </div>

    <div class="form-group">
      <label class="label" for="cf-moneda">Moneda</label>
      <select id="cf-moneda" class="select" bind:value={moneda}>
        {#each MONEDAS_COMPLEMENTO as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="cf-forma-pago">Forma de pago SAT</label>
      <select id="cf-forma-pago" class="select" bind:value={formaPago}>
        {#each FORMAS_PAGO_SAT as fp}
          <option value={fp.value}>{fp.label}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="cf-unidad">Unidad</label>
      <select id="cf-unidad" class="select" bind:value={unidad}>
        <option value="">Sin especificar</option>
        {#each UNIDADES_COMPLEMENTO as u}
          <option value={u}>{u}</option>
        {/each}
      </select>
    </div>

    <div class="form-group full">
      <label class="label" for="cf-obs">Observaciones</label>
      <textarea id="cf-obs" class="input textarea" bind:value={observaciones} rows="2"></textarea>
    </div>
  </div>

  <section class="facturas-section">
    <div class="facturas-header">
      <h3>Facturas PPD relacionadas *</h3>
      <button type="button" class="btn btn-secondary btn-sm" onclick={cargarFacturas} disabled={cargandoFacturas}>
        {cargandoFacturas ? 'Cargando...' : 'Actualizar lista'}
      </button>
    </div>

    {#if cargandoFacturas}
      <p class="hint">Cargando facturas disponibles...</p>
    {:else if facturasDisponibles.length === 0}
      <p class="hint">No hay facturas PPD con saldo pendiente para los filtros actuales.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>No. factura</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Fecha pago</th>
              <th class="num">Total</th>
              <th class="num">Saldo</th>
              <th class="num">Importe pagado</th>
            </tr>
          </thead>
          <tbody>
            {#each facturasDisponibles as f}
              <tr class:seleccionada={estaSeleccionada(f._id)}>
                <td>
                  <input
                    type="checkbox"
                    checked={estaSeleccionada(f._id)}
                    onchange={() => toggleFactura(f)}
                  />
                </td>
                <td>{f.noFactura}</td>
                <td>{f.cliente}</td>
                <td>{f.unidad ?? '—'}</td>
                <td>{fechaCorta(f.fechaPago)}</td>
                <td class="num">{formatearMoneda(f.total)}</td>
                <td class="num">{formatearMoneda(saldoFactura(f))}</td>
                <td class="num">
                  {#if estaSeleccionada(f._id)}
                    <input
                      class="input input-sm"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={saldoFactura(f)}
                      value={seleccionadas.get(f._id)}
                      oninput={(e) =>
                        actualizarImporte(f._id, Number((e.target as HTMLInputElement).value))}
                    />
                  {:else}
                    —
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="suma-linea" class:suma-error={sumaDifiere}>
        Suma importes: <strong>{formatearMoneda(sumaImportes)}</strong>
        · Monto complemento: <strong>{formatearMoneda(Number(monto) || 0)}</strong>
        {#if sumaDifiere}
          <span class="aviso"> — deben coincidir</span>
        {/if}
      </p>
    {/if}
  </section>

  <div class="modal-actions">
    <button type="button" class="btn btn-secondary" onclick={onCancelar}>Cancelar</button>
    <button type="button" class="btn btn-primary" disabled={guardando} onclick={enviar}>
      {guardando ? 'Guardando...' : 'Registrar complemento'}
    </button>
  </div>
</form>

<style>
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .form-grid .full {
    grid-column: 1 / -1;
  }

  .textarea {
    resize: vertical;
    min-height: 3rem;
  }

  .facturas-section {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .facturas-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .facturas-header h3 {
    font-size: 0.95rem;
    margin: 0;
  }

  .hint {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .num {
    text-align: right;
    white-space: nowrap;
  }

  tr.seleccionada {
    background: #f0fdf4;
  }

  .input-sm {
    max-width: 7rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
  }

  .suma-linea {
    margin-top: 0.75rem;
    font-size: 0.875rem;
  }

  .suma-error {
    color: #b45309;
  }

  .aviso {
    font-weight: 600;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  @media (max-width: 768px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
