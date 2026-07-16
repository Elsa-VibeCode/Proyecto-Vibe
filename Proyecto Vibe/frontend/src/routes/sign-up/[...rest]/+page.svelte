<script lang="ts">
  import { SignUp } from 'svelte-clerk/client';
</script>

<div class="auth-page">
  <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/panel" />
</div>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #e0e7ff 100%);
  }
</style>
