<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import ComplementoForm from '$lib/components/ComplementoForm.svelte';
  import type { ComplementoPayload } from '$lib/types/complementos';
  import type { ApiResponse } from '$lib/types/complementos';

  let guardando = $state(false);
  let error = $state('');

  let facturaId = $derived($page.url.searchParams.get('facturaId') || '');

  async function guardar(datos: ComplementoPayload) {
    guardando = true;
    error = '';
    try {
      await api<ApiResponse<{ complemento: unknown }>>('/complementos', {
        method: 'POST',
        body: JSON.stringify(datos),
      });
      await goto('/complementos');
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo registrar el complemento';
      throw err;
    } finally {
      guardando = false;
    }
  }
</script>

<svelte:head>
  <title>Nuevo complemento — AdminSys</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Nuevo complemento de pago</h1>
      <p>Registra un REP y vincúlalo a una o más facturas PPD</p>
    </div>
    <a href="/complementos" class="btn btn-secondary">← Volver al listado</a>
  </header>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="card form-card">
    <ComplementoForm
      facturaIdPreseleccionada={facturaId}
      {guardando}
      onGuardar={guardar}
      onCancelar={() => goto('/complementos')}
    />
  </div>
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .page-header h1 {
    font-size: 1.5rem;
    margin-bottom: 0.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .page-header .btn {
    text-decoration: none;
  }

  .form-card {
    padding: 1.5rem;
  }

  .alert {
    margin-bottom: 1rem;
  }
</style>
