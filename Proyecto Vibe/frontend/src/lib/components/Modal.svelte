<script lang="ts">
  interface Props {
    abierto: boolean;
    titulo: string;
    onCerrar: () => void;
    children?: import('svelte').Snippet;
  }

  let { abierto, titulo, onCerrar, children }: Props = $props();
</script>

{#if abierto}
  <div class="overlay" onclick={onCerrar} role="presentation">
    <div class="modal card" onclick={(e) => e.stopPropagation()} role="dialog">
      <header>
        <h2>{titulo}</h2>
        <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
      </header>
      <div class="contenido">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    width: 100%;
    max-width: 480px;
    padding: 0;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  header h2 {
    font-size: 1.1rem;
  }

  .cerrar {
    width: 2rem;
    height: 2rem;
    border-radius: 6px;
    color: var(--color-text-muted);
    font-size: 1rem;
  }

  .cerrar:hover {
    background: var(--color-bg);
  }

  .contenido {
    padding: 1.5rem;
  }
</style>
