<script lang="ts">
  import '../app.css';
  import { env } from '$env/dynamic/public';
  import { ClerkProvider } from 'svelte-clerk';
  import AppShell from '$lib/components/AppShell.svelte';

  let { children } = $props();

  const publishableKey =
    env.PUBLIC_CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
</script>

<ClerkProvider
  {publishableKey}
  signInUrl="/sign-in"
  signUpUrl="/sign-up"
  signInFallbackRedirectUrl="/panel"
  signUpFallbackRedirectUrl="/panel"
>
  <AppShell>
    {@render children()}
  </AppShell>
</ClerkProvider>
