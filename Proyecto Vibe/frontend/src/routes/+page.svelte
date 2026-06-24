<script lang="ts">
  import { env } from '$env/dynamic/public';

  const publishableKey =
    env.PUBLIC_CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
</script>

<div class="login-page">
  <div class="login-card card">
    <div class="login-header">
      <span class="icon">⚙️</span>
      <h1>Sistema de Administración</h1>
      <p>Inicia sesión o crea tu cuenta</p>
    </div>

    {#if !publishableKey}
      <div class="alert alert-error">
        Falta la clave de Clerk en <code>frontend/.env</code>:
        <code>PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...</code>
      </div>
    {/if}

    <div class="actions">
      <a class="btn btn-primary submit" href="/sign-in">Iniciar sesión</a>
      <a class="btn btn-secondary submit" href="/sign-up">Registrarse</a>
    </div>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #e0e7ff 100%);
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    padding: 2rem;
  }

  .login-header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .icon {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 0.75rem;
  }

  .login-header h1 {
    font-size: 1.4rem;
    margin-bottom: 0.35rem;
  }

  .login-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .actions {
    display: grid;
    gap: 0.75rem;
  }

  .submit {
    width: 100%;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    box-sizing: border-box;
  }

  code {
    font-size: 0.8rem;
    word-break: break-all;
  }
</style>
