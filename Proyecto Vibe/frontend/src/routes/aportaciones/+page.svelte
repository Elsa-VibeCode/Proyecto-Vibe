<script lang="ts">
  import AportacionesPanel from '$lib/components/AportacionesPanel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Aportaciones al Grupo</h1>
      <p>Cuándo aportó cada unidad a los gastos de Grupo, mes a mes, y avance del mes actual</p>
    </div>
  </header>
  <AportacionesPanel />
</div>

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .page-header p { color: var(--color-text-muted); font-size: 0.9rem; }
</style>
