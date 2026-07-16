<script lang="ts">
  import { formatearMoneda } from '$lib/excelFiltros';
  import type { PanelSaldo } from '$lib/types/panel';

  interface Props {
    saldos: PanelSaldo[];
    ytd?: boolean;
    onToggleYtd?: (ytd: boolean) => void;
    cargando?: boolean;
  }

  let { saldos, ytd = false, onToggleYtd, cargando = false }: Props = $props();
</script>

<section class="saldos card">
  <div class="header">
    <h2>Saldos por unidad</h2>
    {#if onToggleYtd}
      <label class="toggle">
        <input
          type="checkbox"
          checked={ytd}
          onchange={(e) => onToggleYtd?.((e.currentTarget as HTMLInputElement).checked)}
        />
        Ver acumulado del año
      </label>
    {/if}
  </div>

  {#if cargando}
    <div class="sk-table"></div>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Unidad</th>
            <th class="num">Saldo inicio</th>
            <th class="num">Ingresos</th>
            <th class="num">Egresos</th>
            <th class="num">Mov. internos</th>
            <th class="num">Saldo fin</th>
          </tr>
        </thead>
        <tbody>
          {#each saldos as fila}
            <tr class:total={fila.unidad === 'caja_bbva'}>
              <td>{fila.etiqueta}</td>
              <td class="num">{formatearMoneda(fila.saldoInicial)}</td>
              <td class="num">{formatearMoneda(fila.ingresos)}</td>
              <td class="num">{formatearMoneda(fila.egresos)}</td>
              <td class="num mov" title={fila.movInternosEtiqueta}>
                {fila.movInternos !== 0 ? formatearMoneda(fila.movInternos) : '—'}
                {#if fila.movInternosEtiqueta && fila.movInternos !== 0}
                  <small>{fila.movInternosEtiqueta}</small>
                {/if}
              </td>
              <td class="num"><strong>{formatearMoneda(fila.saldoFinal)}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .saldos { padding: 1.25rem; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  h2 { font-size: 1.05rem; }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 0.55rem 0.65rem; border-bottom: 1px solid var(--color-border); }
  th { text-align: left; font-size: 0.75rem; color: var(--color-text-muted); }
  .num { text-align: right; white-space: nowrap; }
  tr.total { font-weight: 700; background: #f8fafc; }
  .mov small {
    display: block;
    font-size: 0.65rem;
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .table-wrap { overflow-x: auto; }

  .sk-table {
    height: 160px;
    background: #eee;
    border-radius: 8px;
  }
</style>
