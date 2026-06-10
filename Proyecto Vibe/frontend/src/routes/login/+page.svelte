<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth';

  let email = $state('admin@ejemplo.com');
  let password = $state('');
  let error = $state('');
  let cargando = $state(false);

  async function iniciarSesion(e: Event) {
    e.preventDefault();
    error = '';
    cargando = true;

    try {
      await auth.login(email, password);
      goto('/dashboard');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al iniciar sesión';
    } finally {
      cargando = false;
    }
  }
</script>

<div class="login-page">
  <div class="login-card card">
    <div class="login-header">
      <span class="icon">⚙️</span>
      <h1>Sistema de Administración</h1>
      <p>Ingresa tus credenciales para continuar</p>
    </div>

    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    <form onsubmit={iniciarSesion}>
      <div class="form-group">
        <label class="label" for="email">Correo electrónico</label>
        <input
          id="email"
          class="input"
          type="email"
          bind:value={email}
          placeholder="tu@correo.com"
          required
        />
      </div>

      <div class="form-group">
        <label class="label" for="password">Contraseña</label>
        <input
          id="password"
          class="input"
          type="password"
          bind:value={password}
          placeholder="••••••••"
          required
        />
      </div>

      <button class="btn btn-primary submit" type="submit" disabled={cargando}>
        {cargando ? 'Ingresando...' : 'Iniciar sesión'}
      </button>
    </form>

    <p class="hint">
      Usa las credenciales del seed: <code>admin@ejemplo.com</code> / <code>admin123</code>
    </p>
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
    margin-bottom: 1.75rem;
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

  .alert {
    margin-bottom: 1rem;
  }

  .submit {
    width: 100%;
    margin-top: 0.5rem;
  }

  .hint {
    margin-top: 1.5rem;
    text-align: center;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  code {
    background: var(--color-bg);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.78rem;
  }
</style>
