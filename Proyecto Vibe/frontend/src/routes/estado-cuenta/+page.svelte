<script lang="ts">
  import EstadoCuentaPanel from '$lib/components/EstadoCuentaPanel.svelte';
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Estado de cuenta</h1>
      <p>Movimientos, ingresos, egresos y saldos por unidad de negocio</p>
    </div>
  </header>
  <EstadoCuentaPanel />
</div>

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .page-header p { color: var(--color-text-muted); font-size: 0.9rem; }
</style>
