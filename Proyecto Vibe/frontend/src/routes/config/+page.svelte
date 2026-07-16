<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let aportePct = $state('10');
  let fechaVigencia = $state('2026-04-01');
  let latamKonfio = $state('7153.33');
  let cargando = $state(true);
  let guardando = $state(false);
  let mensaje = $state('');
  let error = $state('');

  async function cargar() {
    cargando = true;
    error = '';
    try {
      const data = await api<{ config: { aporteConsultingPct: number; fechaVigenciaRegla: string; latamKonfioMensual: number } }>('/config');
      aportePct = String((data.config.aporteConsultingPct ?? 0.1) * 100);
      fechaVigencia = data.config.fechaVigenciaRegla ?? '2026-04-01';
      latamKonfio = String(data.config.latamKonfioMensual ?? 7153.33);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar configuración';
    } finally {
      cargando = false;
    }
  }

  onMount(cargar);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    guardando = true;
    mensaje = '';
    error = '';
    try {
      await api('/config', {
        method: 'PUT',
        body: JSON.stringify({
          aporteConsultingPct: Number(aportePct) / 100,
          fechaVigenciaRegla: fechaVigencia,
          latamKonfioMensual: Number(latamKonfio),
        }),
      });
      mensaje = 'Configuración guardada';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar';
    } finally {
      guardando = false;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Configuración</h1>
      <p>Reglas de negocio del Panel (aporte Consulting → Grupo)</p>
    </div>
    <a href="/panel" class="btn btn-secondary">← Volver al Panel</a>
  </header>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if cargando}
    <p>Cargando…</p>
  {:else}
    <form class="card form-config" onsubmit={guardar}>
      <div class="form-group">
        <label class="label" for="aporte">Aporte Consulting (%)</label>
        <input id="aporte" class="input" type="number" step="0.1" min="0" max="100" bind:value={aportePct} />
      </div>
      <div class="form-group">
        <label class="label" for="vigencia">Fecha vigencia regla 10%</label>
        <input id="vigencia" class="input" type="date" bind:value={fechaVigencia} />
      </div>
      <div class="form-group">
        <label class="label" for="latam">LATAM Konfío mensual (MXN)</label>
        <input id="latam" class="input" type="number" step="0.01" bind:value={latamKonfio} />
      </div>
      <button type="submit" class="btn btn-primary" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  {/if}
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .form-config {
    padding: 1.5rem;
    max-width: 480px;
  }
  .form-group { margin-bottom: 1rem; }
  .alert-success {
    padding: 0.75rem 1rem;
    background: #ecfdf5;
    color: #047857;
    border-radius: var(--radius);
    margin-bottom: 1rem;
  }
</style>
