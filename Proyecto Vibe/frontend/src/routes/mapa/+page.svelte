<script lang="ts">
  import MapaUbicacion from '$lib/components/MapaUbicacion.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Mapa</h1>
      <p>Visualiza tu ubicación actual en tiempo real — México (CDMX)</p>
    </div>
  </header>

  <section class="card mapa-seccion">
    <MapaUbicacion altura="calc(100vh - 220px)" />
  </section>
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

  .mapa-seccion {
    padding: 1.25rem;
  }
</style>
