<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/excelFiltros';
  import type {
    ClienteHistorialFactura,
    EstatusEnvioFactura,
    EstatusPagoFactura,
    FacturaDocument,
    FacturaPayload,
    RfcEmisorFactura,
    UnidadFactura,
  } from '$lib/types/admin';
  import {
    calcularIvaFactura,
    calcularTotalFactura,
    cargarBorradorFactura,
    guardarBorradorFactura,
    limpiarBorradorFactura,
  } from '$lib/types/admin';

  interface Props {
    factura?: FacturaDocument | null;
    modoEdicion?: boolean;
    guardando?: boolean;
    onGuardar: (datos: FacturaPayload, crearOtra: boolean) => void | Promise<void>;
    onCancelar: () => void;
  }

  let { factura = null, modoEdicion = false, guardando = false, onGuardar, onCancelar }: Props = $props();

  const hoy = new Date().toISOString().slice(0, 10);
  const inicial = untrack(() => factura);

  function fechaInput(valor?: string | Date | null): string {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(String(valor));
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function unidadInicial(): UnidadFactura | '' {
    const u = inicial?.unidad;
    if (u === 'Consulting' || u === 'Technologies' || u === 'Grupo') return u;
    return '';
  }

  let fechaFacturacion = $state(fechaInput(inicial?.fechaFacturacion) || hoy);
  let noFactura = $state(inicial?.noFactura ?? '');
  let cliente = $state(inicial?.cliente ?? '');
  let concepto = $state(inicial?.concepto ?? '');
  let unidad = $state<UnidadFactura | ''>(unidadInicial());
  let subtotal = $state<number>(inicial?.subtotal ?? 0);
  let ivaManual = $state(inicial?.iva !== undefined);
  let iva = $state<number>(inicial?.iva ?? 0);
  let totalManual = $state(inicial?.total !== undefined);
  let total = $state<number>(inicial?.total ?? 0);
  let fechaPago = $state(fechaInput(inicial?.fechaPago));
  let estatusEnvio = $state<EstatusEnvioFactura>(inicial?.estatusEnvio ?? 'ENVIADA');
  let estatusPago = $state<EstatusPagoFactura>(inicial?.estatusPago ?? 'PENDIENTE');
  let rfcEmisor = $state<RfcEmisorFactura>(inicial?.rfcEmisor ?? 'GBL');
  let complementoPago = $state(inicial?.complementoPago ?? '');

  let clientes = $state<string[]>([]);
  let conceptos = $state<string[]>([]);
  let historial = $state<ClienteHistorialFactura | null>(null);
  let folioDuplicado = $state(false);
  let verificandoFolio = $state(false);
  let errorForm = $state('');
  let sucio = $state(false);

  const ivaAuto = $derived(calcularIvaFactura(Number(subtotal) || 0, cliente));
  const totalAuto = $derived(calcularTotalFactura(Number(subtotal) || 0, ivaManual ? Number(iva) || 0 : ivaAuto));
  const totalDifiere = $derived(
    !totalManual && Math.abs((Number(total) || 0) - totalAuto) > 0.01
  );

  $effect(() => {
    if (!ivaManual) iva = ivaAuto;
  });

  $effect(() => {
    if (!totalManual) total = totalAuto;
  });

  $effect(() => {
    if (fechaPago && estatusPago === 'PENDIENTE') estatusPago = 'PAGADO';
  });

  $effect(() => {
    if (!modoEdicion && sucio) {
      guardarBorradorFactura({
        fechaFacturacion,
        noFactura,
        cliente,
        concepto,
        unidad: unidad || undefined,
        subtotal: Number(subtotal),
        iva: Number(iva),
        total: Number(total),
        fechaPago: fechaPago || undefined,
        estatusEnvio,
        estatusPago,
        rfcEmisor,
        complementoPago,
      });
    }
  });

  onMount(async () => {
    try {
      const res = await api<{ ok: boolean; data: { clientes: string[] } }>('/facturas/clientes');
      clientes = res.data?.clientes ?? [];
    } catch {
      /* opcional */
    }

    if (!modoEdicion) {
      const borrador = cargarBorradorFactura();
      if (borrador && Object.keys(borrador).length > 0) {
        const usar = confirm('Hay un borrador sin guardar. ¿Deseas recuperarlo?');
        if (usar) {
          fechaFacturacion = borrador.fechaFacturacion ?? hoy;
          noFactura = borrador.noFactura ?? '';
          cliente = borrador.cliente ?? '';
          concepto = borrador.concepto ?? '';
          unidad = (borrador.unidad as UnidadFactura) ?? '';
          subtotal = borrador.subtotal ?? 0;
          iva = borrador.iva ?? 0;
          total = borrador.total ?? 0;
          fechaPago = borrador.fechaPago ?? '';
          estatusEnvio = borrador.estatusEnvio ?? 'ENVIADA';
          estatusPago = borrador.estatusPago ?? 'PENDIENTE';
          rfcEmisor = borrador.rfcEmisor ?? 'GBL';
          complementoPago = borrador.complementoPago ?? '';
        } else {
          limpiarBorradorFactura();
        }
      }
    }

    if (cliente.trim()) {
      await cargarHistorialCliente();
      await cargarConceptos();
    }
  });

  function marcarSucio() {
    sucio = true;
  }

  async function verificarFolio() {
    const folio = noFactura.trim();
    if (!folio) {
      folioDuplicado = false;
      return;
    }
    verificandoFolio = true;
    try {
      const params = new URLSearchParams({ noFactura: folio });
      if (modoEdicion && inicial?._id) params.set('excludeId', inicial._id);
      const res = await api<{ ok: boolean; data: { disponible: boolean } }>(
        `/facturas/check-folio?${params}`
      );
      folioDuplicado = !res.data?.disponible;
    } catch {
      folioDuplicado = false;
    } finally {
      verificandoFolio = false;
    }
  }

  async function cargarHistorialCliente() {
    const nombre = cliente.trim();
    if (!nombre) {
      historial = null;
      return;
    }
    try {
      const res = await api<{ ok: boolean; data: ClienteHistorialFactura }>(
        `/facturas/cliente-historial?cliente=${encodeURIComponent(nombre)}`
      );
      historial = res.data ?? null;
      if (!modoEdicion && historial?.unidadSugerida && !unidad) {
        const sugerida = historial.unidadSugerida;
        if (sugerida === 'Consulting' || sugerida === 'Technologies' || sugerida === 'Grupo') {
          unidad = sugerida;
        }
      }
    } catch {
      historial = null;
    }
  }

  async function cargarConceptos() {
    const nombre = cliente.trim();
    if (!nombre) {
      conceptos = [];
      return;
    }
    try {
      const res = await api<{ ok: boolean; data: { conceptos: string[] } }>(
        `/facturas/conceptos?cliente=${encodeURIComponent(nombre)}`
      );
      conceptos = res.data?.conceptos ?? [];
    } catch {
      conceptos = [];
    }
  }

  async function onClienteBlur() {
    marcarSucio();
    await cargarHistorialCliente();
    await cargarConceptos();
  }

  function etiquetaHistorial(): string {
    if (!historial?.unidadesUsadas?.length) return '';
    return historial.unidadesUsadas
      .map((u) => `${u.unidad} × ${u.count}`)
      .join(', ');
  }

  function validar(): string | null {
    if (!fechaFacturacion) return 'La fecha de facturación es obligatoria';
    if (!noFactura.trim()) return 'El número de factura es obligatorio';
    if (folioDuplicado) return 'Ya existe una factura con ese número';
    if (!cliente.trim()) return 'El cliente es obligatorio';
    if (!concepto.trim()) return 'El concepto es obligatorio';
    if (!unidad) return 'Selecciona la unidad de negocio';
    if (Number(subtotal) <= 0) return 'El subtotal debe ser mayor a 0';
    if (Number(total) < 0) return 'El total no puede ser negativo';
    if (estatusPago === 'PAGADO' && !fechaPago) {
      return 'Si el estatus de pago es PAGADO, la fecha de pago es obligatoria';
    }
    return null;
  }

  async function enviar(crearOtra: boolean) {
    errorForm = '';
    const err = validar();
    if (err) {
      errorForm = err;
      return;
    }

    try {
      await onGuardar(
        {
          fechaFacturacion,
          noFactura: noFactura.trim(),
          cliente: cliente.trim(),
          concepto: concepto.trim(),
          unidad: unidad as UnidadFactura,
          subtotal: Number(subtotal),
          iva: Number(iva),
          total: Number(total),
          fechaPago: fechaPago || undefined,
          estatusEnvio,
          estatusPago,
          rfcEmisor,
          complementoPago: complementoPago.trim() || undefined,
        },
        crearOtra
      );
    } catch (err) {
      errorForm = err instanceof Error ? err.message : 'No se pudo guardar la factura';
    }
  }

  export function limpiarParaNueva(fechaConservar?: string) {
    fechaFacturacion = fechaConservar ?? fechaFacturacion;
    noFactura = '';
    cliente = '';
    concepto = '';
    unidad = '';
    subtotal = 0;
    iva = 0;
    total = 0;
    fechaPago = '';
    estatusEnvio = 'ENVIADA';
    estatusPago = 'PENDIENTE';
    rfcEmisor = 'GBL';
    complementoPago = '';
    historial = null;
    conceptos = [];
    folioDuplicado = false;
    ivaManual = false;
    totalManual = false;
    sucio = false;
    errorForm = '';
  }

  export function cancelarConConfirmacion() {
    if (sucio && !confirm('Hay cambios sin guardar. ¿Deseas cerrar sin guardar?')) return;
    onCancelar();
  }
</script>

<form class="factura-form" onsubmit={(e) => e.preventDefault()}>
  {#if errorForm}
    <div class="alert alert-error">{errorForm}</div>
  {/if}

  <div class="form-grid">
    <div class="form-group">
      <label class="label" for="ff-fecha">Fecha facturación *</label>
      <input
        id="ff-fecha"
        class="input"
        type="date"
        bind:value={fechaFacturacion}
        oninput={marcarSucio}
        required
      />
    </div>

    <div class="form-group">
      <label class="label" for="ff-folio">No. factura *</label>
      <input
        id="ff-folio"
        class="input"
        class:input-error={folioDuplicado}
        bind:value={noFactura}
        oninput={marcarSucio}
        onblur={verificarFolio}
        placeholder="GBL-1234"
        required
      />
      {#if verificandoFolio}
        <span class="hint">Verificando...</span>
      {:else if folioDuplicado}
        <span class="badge-error">Folio ya existe</span>
      {/if}
    </div>

    <div class="form-group full">
      <label class="label" for="ff-cliente">Cliente *</label>
      <input
        id="ff-cliente"
        class="input"
        list="lista-clientes-factura"
        bind:value={cliente}
        oninput={marcarSucio}
        onblur={onClienteBlur}
        placeholder="Razón social del cliente"
        required
      />
      <datalist id="lista-clientes-factura">
        {#each clientes as c}
          <option value={c}></option>
        {/each}
      </datalist>
    </div>

    <div class="form-group full">
      <label class="label" for="ff-concepto">Concepto *</label>
      <textarea
        id="ff-concepto"
        class="input textarea"
        bind:value={concepto}
        oninput={marcarSucio}
        rows="3"
        placeholder="Descripción del servicio o producto facturado"
        required
      ></textarea>
      {#if conceptos.length > 0}
        <div class="sugerencias-concepto">
          {#each conceptos.slice(0, 5) as c}
            <button type="button" class="chip-concepto" onclick={() => { concepto = c; marcarSucio(); }}>
              {c}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="form-group full">
      <label class="label" for="ff-unidad">Área de venta (Unidad) *</label>
      <select id="ff-unidad" class="select" bind:value={unidad} onchange={marcarSucio} required>
        <option value="">Seleccionar...</option>
        <option value="Consulting">Consulting</option>
        <option value="Technologies">Technologies</option>
        <option value="Grupo">Grupo</option>
      </select>
      {#if historial && historial.unidadesUsadas.length > 1}
        <p class="aviso-historial">
          ⚠ Este cliente tuvo otras clasificaciones: {etiquetaHistorial()}
        </p>
      {:else if historial && historial.unidadesUsadas.length === 1}
        <p class="hint">Histórico: {etiquetaHistorial()}</p>
      {/if}
    </div>

    <div class="form-group">
      <label class="label" for="ff-subtotal">Subtotal *</label>
      <input
        id="ff-subtotal"
        class="input"
        type="number"
        min="0.01"
        step="0.01"
        bind:value={subtotal}
        oninput={() => {
          marcarSucio();
          ivaManual = false;
          totalManual = false;
        }}
        required
      />
    </div>

    <div class="form-group">
      <label class="label" for="ff-iva">IVA</label>
      <input
        id="ff-iva"
        class="input"
        type="number"
        min="0"
        step="0.01"
        bind:value={iva}
        oninput={() => {
          marcarSucio();
          ivaManual = true;
          totalManual = false;
        }}
      />
      <span class="hint">Auto: {formatearMoneda(ivaAuto)}</span>
    </div>

    <div class="form-group">
      <label class="label" for="ff-total">Total</label>
      <input
        id="ff-total"
        class="input"
        type="number"
        min="0"
        step="0.01"
        bind:value={total}
        oninput={() => {
          marcarSucio();
          totalManual = true;
        }}
      />
      {#if totalDifiere || (totalManual && Math.abs(Number(total) - totalAuto) > 0.01)}
        <span class="aviso-total">⚠ Difiere del cálculo automático ({formatearMoneda(totalAuto)})</span>
      {/if}
    </div>

    <div class="form-group">
      <label class="label" for="ff-fecha-pago">Fecha pago</label>
      <input
        id="ff-fecha-pago"
        class="input"
        type="date"
        bind:value={fechaPago}
        oninput={marcarSucio}
      />
    </div>

    <div class="form-group">
      <label class="label" for="ff-estatus-envio">Estatus envío *</label>
      <select id="ff-estatus-envio" class="select" bind:value={estatusEnvio} onchange={marcarSucio}>
        <option value="ENVIADA">Enviada</option>
        <option value="POR_ENVIAR">Por enviar</option>
        <option value="CANCELADA">Cancelada</option>
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="ff-estatus-pago">Estatus pago *</label>
      <select id="ff-estatus-pago" class="select" bind:value={estatusPago} onchange={marcarSucio}>
        <option value="PENDIENTE">Pendiente</option>
        <option value="PAGADO">Pagado</option>
        <option value="PARCIAL">Parcial</option>
        <option value="VENCIDO">Vencido</option>
        <option value="CANCELADO">Cancelado</option>
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="ff-rfc">RFC emisor *</label>
      <select id="ff-rfc" class="select" bind:value={rfcEmisor} onchange={marcarSucio}>
        <option value="GBL">GBL</option>
        <option value="GAVM">GAVM</option>
        <option value="OTRO">Otro</option>
      </select>
    </div>

    <div class="form-group full">
      <label class="label" for="ff-complemento">Complemento de pago</label>
      <input
        id="ff-complemento"
        class="input"
        bind:value={complementoPago}
        oninput={marcarSucio}
        placeholder="Referencia del complemento CFDI (opcional)"
      />
    </div>
  </div>

  <div class="modal-actions">
    <button type="button" class="btn btn-secondary" onclick={cancelarConConfirmacion}>Cancelar</button>
    {#if !modoEdicion}
      <button
        type="button"
        class="btn btn-secondary"
        disabled={guardando}
        onclick={() => enviar(true)}
      >
        Guardar y crear otra
      </button>
    {/if}
    <button type="button" class="btn btn-primary" disabled={guardando} onclick={() => enviar(false)}>
      {guardando ? 'Guardando...' : 'Guardar'}
    </button>
  </div>
</form>

<style>
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .form-grid .full { grid-column: 1 / -1; }

  .textarea { resize: vertical; min-height: 4.5rem; }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .hint { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.2rem; display: block; }

  .badge-error {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: #991b1b;
    background: #fee2e2;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
  }

  .input-error { border-color: #f87171; }

  .aviso-historial {
    margin: 0.35rem 0 0;
    font-size: 0.78rem;
    color: #854d0e;
    background: #fef9c3;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
  }

  .aviso-total {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.75rem;
    color: #b45309;
  }

  .sugerencias-concepto {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }

  .chip-concepto {
    font-size: 0.72rem;
    padding: 0.2rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    cursor: pointer;
  }

  .chip-concepto:hover { border-color: var(--color-primary); color: var(--color-primary); }
</style>
