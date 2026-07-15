<script lang="ts">
  import FacturacionPanel from '$lib/components/FacturacionPanel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Facturación</h1>
      <p>Resumen de ingresos por factura, cliente y área de venta. Captura manual y clasificación por factura.</p>
    </div>
  </header>

  <FacturacionPanel />
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .page-header p { color: var(--color-text-muted); font-size: 0.9rem; }
</style>
