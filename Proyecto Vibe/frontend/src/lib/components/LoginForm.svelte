<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth';

  let modo = $state<'login' | 'registro'>('login');
  let email = $state('');
  let password = $state('');
  let confirmarPassword = $state('');
  let error = $state('');
  let cargando = $state(false);

  function cambiarModo(nuevoModo: 'login' | 'registro') {
    modo = nuevoModo;
    error = '';
    password = '';
    confirmarPassword = '';
  }

  async function enviarFormulario(e: Event) {
    e.preventDefault();
    error = '';

    if (modo === 'registro' && password !== confirmarPassword) {
      error = 'Las contraseñas no coinciden';
      return;
    }

    if (password.length < 6) {
      error = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }

    cargando = true;

    try {
      if (modo === 'login') {
        await auth.login(email, password);
      } else {
        await auth.registro(email, password);
      }
      goto('/dashboard');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Ocurrió un error';
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
      <p>
        {modo === 'login'
          ? 'Ingresa con tu correo y contraseña'
          : 'Crea tu cuenta con correo y contraseña'}
      </p>
    </div>

    <div class="tabs">
      <button
        type="button"
        class:active={modo === 'login'}
        onclick={() => cambiarModo('login')}
      >
        Iniciar sesión
      </button>
      <button
        type="button"
        class:active={modo === 'registro'}
        onclick={() => cambiarModo('registro')}
      >
        Registrarse
      </button>
    </div>

    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    <form onsubmit={enviarFormulario}>
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
          placeholder="Mínimo 6 caracteres"
          required
          minlength="6"
        />
      </div>

      {#if modo === 'registro'}
        <div class="form-group">
          <label class="label" for="confirmar">Confirmar contraseña</label>
          <input
            id="confirmar"
            class="input"
            type="password"
            bind:value={confirmarPassword}
            placeholder="Repite tu contraseña"
            required
            minlength="6"
          />
        </div>
      {/if}

      <button class="btn btn-primary submit" type="submit" disabled={cargando}>
        {#if cargando}
          {modo === 'login' ? 'Ingresando...' : 'Registrando...'}
        {:else}
          {modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        {/if}
      </button>
    </form>

    <p class="hint">
      {#if modo === 'login'}
        ¿No tienes cuenta?
        <button type="button" class="link" onclick={() => cambiarModo('registro')}>
          Regístrate aquí
        </button>
      {:else}
        ¿Ya tienes cuenta?
        <button type="button" class="link" onclick={() => cambiarModo('login')}>
          Inicia sesión
        </button>
      {/if}
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

  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    background: var(--color-bg);
    padding: 0.35rem;
    border-radius: var(--radius);
  }

  .tabs button {
    padding: 0.6rem 0.75rem;
    border-radius: calc(var(--radius) - 2px);
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-muted);
    transition: background 0.15s, color 0.15s;
  }

  .tabs button.active {
    background: var(--color-surface);
    color: var(--color-primary);
    box-shadow: var(--shadow);
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
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .link {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: underline;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
</style>
