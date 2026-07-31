<script lang="ts">
  import { auth } from '$lib/auth';

  let puedeEditar = $derived(
    $auth.usuario?.rol === 'admin' || $auth.usuario?.rol === 'editor'
  );
</script>

<svelte:head>
  <title>Consultoría — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Consultoría (BWConsulting)</h1>
      <p>Seguimiento de operación — pipeline, proyectos e ingresos</p>
    </div>
  </header>

  {#if !puedeEditar}
    <p class="estado">Requiere rol admin o editor.</p>
  {:else}
    <section class="cards">
      <a class="card link-card" href="/consultoria/propuestas">
        <h2>Propuestas</h2>
        <p>Pipeline comercial: alta, filtros, Kanban y resumen.</p>
        <span class="cta">Abrir →</span>
      </a>
      <a class="card link-card" href="/consultoria/proyectos">
        <h2>Proyectos</h2>
        <p>Operación por consultor/cliente, semáforo y % compartido.</p>
        <span class="cta">Abrir →</span>
      </a>
      <a class="card link-card" href="/consultoria/ingresos">
        <h2>Ingresos</h2>
        <p>Detalle auditable, cierre de mes, conciliación con facturas.</p>
        <span class="cta">Abrir →</span>
      </a>
      <div class="card muted-card">
        <h2>Dashboard</h2>
        <p>KPIs y gráficas — etapa 6.</p>
      </div>
    </section>
  {/if}
</div>

<style>
  .page {
    padding: 1.5rem;
  }
  .page-header {
    margin-bottom: 1.25rem;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 1.1rem;
  }
  .link-card {
    text-decoration: none;
    color: inherit;
    background: #f8fafc;
    transition: border-color 0.15s;
  }
  .link-card:hover {
    border-color: #93c5fd;
  }
  .link-card h2 {
    margin: 0 0 0.35rem;
    color: #1d4ed8;
  }
  .cta {
    display: inline-block;
    margin-top: 0.75rem;
    color: #1d4ed8;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .muted-card {
    opacity: 0.65;
  }
  .muted-card h2 {
    margin: 0 0 0.35rem;
  }
  .estado {
    color: #64748b;
  }
</style>
