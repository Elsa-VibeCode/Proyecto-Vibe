<script lang="ts">
  interface Props {
    mesActivo: string;
    opcionesMes: string[];
    disabled?: boolean;
    onchange?: () => void;
  }

  let { mesActivo = $bindable(''), opcionesMes, disabled = false, onchange }: Props = $props();
</script>

<label class="mes-select">
  Mes:
  <select bind:value={mesActivo} {disabled} onchange={() => onchange?.()}>
    {#each opcionesMes as m}
      <option value={m}>{m}</option>
    {/each}
  </select>
</label>

<style>
  .mes-select {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .mes-select select {
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }
</style>
