<script lang="ts">
  import type { PanelVista } from '$lib/types/panel';

  interface Props {
    vista: PanelVista;
    disabled?: boolean;
    onchange?: (vista: PanelVista) => void;
  }

  let { vista = $bindable('cobro' as PanelVista), disabled = false, onchange }: Props = $props();

  function seleccionar(v: PanelVista) {
    if (disabled || vista === v) return;
    vista = v;
    onchange?.(v);
  }
</script>

<div class="vista-toggle" role="group" aria-label="Vista contable">
  <button
    type="button"
    class:active={vista === 'facturacion'}
    {disabled}
    onclick={() => seleccionar('facturacion')}
  >
    Facturación
  </button>
  <button
    type="button"
    class:active={vista === 'cobro'}
    {disabled}
    onclick={() => seleccionar('cobro')}
  >
    Cobro
  </button>
</div>

<style>
  .vista-toggle {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    overflow: hidden;
    background: #fff;
  }

  .vista-toggle button {
    border: none;
    background: transparent;
    padding: 0.35rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: background 0.15s, color 0.15s;
  }

  .vista-toggle button.active {
    background: var(--color-primary, #2563eb);
    color: #fff;
    font-weight: 600;
  }

  .vista-toggle button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
