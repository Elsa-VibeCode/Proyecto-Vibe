<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/panel', { replaceState: true });
  });
</script>

<p class="muted">Redirigiendo al panel…</p>

<style>
  .muted {
    color: var(--color-text-muted);
    padding: 2rem;
  }
</style>
