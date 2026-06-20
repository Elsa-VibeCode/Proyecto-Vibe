<script lang="ts">
  import DatosExcel from '$lib/components/DatosExcel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Datos Excel</h1>
      <p>Importa, visualiza y exporta datos desde archivos Excel</p>
    </div>
  </header>

  <DatosExcel />
</div>

<style>
  .page-header {
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }
</style>
