<script lang="ts">
  import ConciliacionPanel from '$lib/components/ConciliacionPanel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Conciliación bancaria</h1>
      <p>Comparativo banco BBVA vs. hoja de facturas por periodo</p>
    </div>
  </header>
  <ConciliacionPanel />
</div>

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .page-header p { color: var(--color-text-muted); font-size: 0.9rem; }
</style>
