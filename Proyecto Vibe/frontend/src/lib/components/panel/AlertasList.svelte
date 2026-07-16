<script lang="ts">
  import type { PanelAlerta } from '$lib/types/panel';

  interface Props {
    alertas: PanelAlerta[];
    cargando?: boolean;
  }

  let { alertas, cargando = false }: Props = $props();

  const iconos: Record<string, string> = {
    alta: '🔴',
    media: '🟠',
    baja: '🟡',
  };
</script>

<section class="alertas card">
  <h2>Alertas</h2>

  {#if cargando}
    <div class="sk-list">
      {#each [1, 2, 3] as _}
        <div class="sk-item"></div>
      {/each}
    </div>
  {:else if alertas.length === 0}
    <div class="todo-ok">🟢 Todo al día</div>
  {:else}
    <ul>
      {#each alertas as alerta}
        <li class="urgencia-{alerta.urgencia}">
          {#if alerta.enlace}
            <a href={alerta.enlace}>
              <span class="icono">{iconos[alerta.urgencia] ?? '⚠'}</span>
              {alerta.descripcion}
            </a>
          {:else}
            <span class="icono">{iconos[alerta.urgencia] ?? '⚠'}</span>
            {alerta.descripcion}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .alertas {
    padding: 1.25rem;
  }

  h2 {
    font-size: 1.05rem;
    margin-bottom: 0.75rem;
  }

  ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li a, li {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.9rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  li a {
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
  }
  li a:hover { background: #f8fafc; }

  .urgencia-alta { border-left: 3px solid #dc2626; }
  .urgencia-media { border-left: 3px solid #ea580c; }
  .urgencia-baja { border-left: 3px solid #ca8a04; }

  .todo-ok {
    padding: 1rem;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: var(--radius);
    color: #047857;
    font-weight: 600;
  }

  .sk-list { display: flex; flex-direction: column; gap: 8px; }
  .sk-item {
    height: 44px;
    background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    border-radius: 6px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
