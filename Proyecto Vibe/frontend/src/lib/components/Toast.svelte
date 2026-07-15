<script lang="ts">
  interface Props {
    mensaje: string;
    visible: boolean;
    onCerrar: () => void;
    onVerDetalles?: () => void;
    onDeshacer?: () => void;
    deshacerSegundos?: number;
  }

  let {
    mensaje,
    visible,
    onCerrar,
    onVerDetalles,
    onDeshacer,
    deshacerSegundos = 0,
  }: Props = $props();
</script>

{#if visible}
  <div class="toast" role="status">
    <span class="toast-msg">{mensaje}</span>
    <div class="toast-acciones">
      {#if onVerDetalles}
        <button type="button" class="toast-btn" onclick={onVerDetalles}>Ver detalles</button>
      {/if}
      {#if onDeshacer && deshacerSegundos > 0}
        <button type="button" class="toast-btn" onclick={onDeshacer}>
          Deshacer ({deshacerSegundos}s)
        </button>
      {/if}
      <button type="button" class="toast-cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
    </div>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: #166534;
    color: white;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
    max-width: min(420px, calc(100vw - 2rem));
  }

  .toast-msg { font-size: 0.9rem; font-weight: 600; flex: 1; }

  .toast-acciones { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }

  .toast-btn {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .toast-btn:hover { background: rgba(255, 255, 255, 0.25); }

  .toast-cerrar {
    background: transparent;
    color: white;
    opacity: 0.8;
    font-size: 0.9rem;
    padding: 0.15rem 0.35rem;
    cursor: pointer;
  }
</style>
