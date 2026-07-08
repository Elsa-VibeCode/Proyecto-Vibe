<script lang="ts">
  import FinanzasPanel from '$lib/components/FinanzasPanel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Finanzas</h1>
      <p>Dashboard del resumen mensual por unidad de negocio</p>
    </div>
  </header>

  <FinanzasPanel />
</div>

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .page-header p { color: var(--color-text-muted); font-size: 0.9rem; }
</style>
