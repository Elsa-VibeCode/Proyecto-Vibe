<script lang="ts">
  import AportacionesExcelPanel from '$lib/components/AportacionesExcelPanel.svelte';
  import FlujoAportacionPanel from '$lib/components/FlujoAportacionPanel.svelte';

  type Tab = 'excel' | 'flujo';
  let tab = $state<Tab>('flujo');
</script>

<div class="tabs">
  <button class:active={tab === 'flujo'} onclick={() => (tab = 'flujo')}>Flujo calculado (A+B)</button>
  <button class:active={tab === 'excel'} onclick={() => (tab = 'excel')}>Excel histórico</button>
</div>

{#if tab === 'flujo'}
  <FlujoAportacionPanel />
{:else}
  <AportacionesExcelPanel />
{/if}

<style>
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .tabs button {
    border: 1px solid var(--color-border);
    background: white;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .tabs button.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
</style>
