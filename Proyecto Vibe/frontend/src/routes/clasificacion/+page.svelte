<script lang="ts">
  import ClasificacionPanel from '$lib/components/ClasificacionPanel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Clasificación</h1>
      <p>Mapas de clientes y proveedores para el motor automático de unidades de negocio</p>
    </div>
  </header>
  <ClasificacionPanel />
</div>

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .page-header p { color: var(--color-text-muted); font-size: 0.9rem; }
</style>
