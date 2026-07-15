<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api } from '$lib/api';
  import { formatearMoneda } from '$lib/utils';
  import {
    ESTADOS_RESULTADO,
    UNIDADES,
    METODOS_PAGO,
    TIPOS_IMPUESTO,
    calcularMontos,
    type Egreso,
    type EstadoResultado,
    type Unidad,
    type MetodoPago,
    type TipoImpuesto,
    type TipoGasto,
  } from '$lib/types/egresos';

  interface Props {
    egreso?: Egreso | null;
    guardando?: boolean;
    onGuardar: (datos: Egreso) => void;
    onCancelar: () => void;
  }

  let { egreso = null, guardando = false, onGuardar, onCancelar }: Props = $props();

  const hoy = new Date().toISOString().slice(0, 10);
  // Snapshot no reactivo del egreso inicial (el form se monta de nuevo por edición).
  const inicial = untrack(() => egreso);

  let fechaGasto = $state(inicial?.fechaGasto ? inicial.fechaGasto.slice(0, 10) : hoy);
  let proyecto = $state(inicial?.proyecto ?? '');
  let estadoResultado = $state<EstadoResultado>(inicial?.estadoResultado ?? 'ADMINISTRATIVO');
  let unidad = $state<Unidad>(inicial?.unidad ?? 'Grupo');
  let tipoGasto = $state(inicial?.tipoGasto ?? '');
  let tipoSubgasto = $state(inicial?.tipoSubgasto ?? '');
  let metodoPago = $state<MetodoPago | ''>(inicial?.metodoPago ?? '');
  let noFactura = $state(inicial?.noFactura ?? '');
  let proveedor = $state(inicial?.proveedor ?? '');
  let concepto = $state(inicial?.concepto ?? '');
  let subtotal = $state<number>(inicial?.subtotal ?? 0);
  let tipoImpuesto = $state<TipoImpuesto>(inicial?.tipoImpuesto ?? 'IVA_16');

  let tiposGasto = $state<TipoGasto[]>([]);
  let proveedores = $state<string[]>([]);

  // Autocálculo en tiempo real (refleja la lógica del backend).
  let montos = $derived(calcularMontos(Number(subtotal), tipoImpuesto));
  let esLatam = $derived(/latam/i.test(concepto));

  onMount(async () => {
    try {
      const [tg, pv] = await Promise.all([
        api<{ tipos: TipoGasto[] }>('/tipos-gasto?activos=1'),
        api<{ proveedores: string[] }>('/egresos/proveedores'),
      ]);
      tiposGasto = tg.tipos;
      proveedores = pv.proveedores;
      if (!tipoGasto && tiposGasto.length) tipoGasto = tiposGasto[0].nombre;
    } catch {
      // Si falla la carga de catálogos, el usuario aún puede escribir el tipo manualmente.
    }
  });

  function enviar(e: Event) {
    e.preventDefault();
    onGuardar({
      fechaGasto,
      proyecto,
      estadoResultado,
      unidad,
      tipoGasto,
      tipoSubgasto,
      metodoPago: metodoPago || undefined,
      noFactura,
      proveedor,
      concepto,
      subtotal: Number(subtotal),
      tipoImpuesto,
    });
  }
</script>

<form onsubmit={enviar} class="egreso-form">
  <div class="grid">
    <div class="form-group">
      <label class="label" for="fechaGasto">Fecha del gasto *</label>
      <input id="fechaGasto" class="input" type="date" bind:value={fechaGasto} required />
    </div>

    <div class="form-group">
      <label class="label" for="unidad">Unidad *</label>
      <select id="unidad" class="select" bind:value={unidad}>
        {#each UNIDADES as u}
          <option value={u}>{u}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="estadoResultado">Estado de resultado *</label>
      <select id="estadoResultado" class="select" bind:value={estadoResultado}>
        {#each ESTADOS_RESULTADO as er}
          <option value={er}>{er}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="proyecto">Proyecto</label>
      <input id="proyecto" class="input" bind:value={proyecto} placeholder="Opcional" />
    </div>

    <div class="form-group">
      <label class="label" for="tipoGasto">Tipo de gasto *</label>
      <input
        id="tipoGasto"
        class="input"
        list="lista-tipos-gasto"
        bind:value={tipoGasto}
        placeholder="Selecciona o escribe"
        required
      />
      <datalist id="lista-tipos-gasto">
        {#each tiposGasto as tg}
          <option value={tg.nombre}></option>
        {/each}
      </datalist>
    </div>

    <div class="form-group">
      <label class="label" for="tipoSubgasto">Tipo de subgasto</label>
      <input id="tipoSubgasto" class="input" bind:value={tipoSubgasto} placeholder="Opcional" />
    </div>

    <div class="form-group">
      <label class="label" for="proveedor">Proveedor *</label>
      <input
        id="proveedor"
        class="input"
        list="lista-proveedores"
        bind:value={proveedor}
        required
      />
      <datalist id="lista-proveedores">
        {#each proveedores as p}
          <option value={p}></option>
        {/each}
      </datalist>
    </div>

    <div class="form-group">
      <label class="label" for="noFactura">No. factura</label>
      <input id="noFactura" class="input" bind:value={noFactura} placeholder="Opcional" />
    </div>

    <div class="form-group">
      <label class="label" for="metodoPago">Método de pago</label>
      <select id="metodoPago" class="select" bind:value={metodoPago}>
        <option value="">—</option>
        {#each METODOS_PAGO as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="tipoImpuesto">Tipo de impuesto</label>
      <select id="tipoImpuesto" class="select" bind:value={tipoImpuesto}>
        {#each TIPOS_IMPUESTO as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label class="label" for="subtotal">Subtotal *</label>
      <input id="subtotal" class="input" type="number" step="0.01" bind:value={subtotal} required />
    </div>
  </div>

  <div class="form-group">
    <label class="label" for="concepto">Concepto *</label>
    <input id="concepto" class="input" bind:value={concepto} required />
    {#if esLatam}
      <p class="hint-latam">Se marcará como transferencia LATAM (Konfío) por contener "LATAM".</p>
    {/if}
  </div>

  <div class="calculo card">
    <div><span>Subtotal</span><strong>{formatearMoneda(Number(subtotal))}</strong></div>
    <div><span>Impuesto</span><strong>{formatearMoneda(montos.impuesto)}</strong></div>
    <div class="total"><span>Total</span><strong>{formatearMoneda(montos.total)}</strong></div>
  </div>

  <div class="form-actions">
    <button type="button" class="btn btn-secondary" onclick={onCancelar}>Cancelar</button>
    <button type="submit" class="btn btn-primary" disabled={guardando}>
      {guardando ? 'Guardando...' : 'Guardar egreso'}
    </button>
  </div>
</form>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem 1rem;
  }

  .hint-latam {
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: var(--color-warning);
  }

  .calculo {
    display: flex;
    gap: 1.5rem;
    padding: 1rem 1.25rem;
    margin: 1rem 0;
    flex-wrap: wrap;
  }

  .calculo div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .calculo span {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .calculo strong {
    font-size: 1.1rem;
  }

  .calculo .total strong {
    color: var(--color-primary);
    font-size: 1.35rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
