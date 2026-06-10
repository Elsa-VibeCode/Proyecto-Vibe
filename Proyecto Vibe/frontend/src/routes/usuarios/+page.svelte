<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth';
  import { api } from '$lib/api';
  import { formatearFecha, etiquetaRol } from '$lib/utils';
  import Modal from '$lib/components/Modal.svelte';
  import type { Usuario, Rol, Paginacion } from '$lib/types';

  let usuarios = $state<Usuario[]>([]);
  let paginacion = $state<Paginacion | null>(null);
  let busqueda = $state('');
  let filtroRol = $state('');
  let pagina = $state(1);
  let cargando = $state(true);
  let error = $state('');
  let mensaje = $state('');

  let modalAbierto = $state(false);
  let modoEdicion = $state(false);
  let usuarioEditando = $state<Usuario | null>(null);
  let guardando = $state(false);

  let formNombre = $state('');
  let formEmail = $state('');
  let formPassword = $state('');
  let formRol = $state<Rol>('visor');
  let formActivo = $state(true);

  let usuarioActual = $derived($auth.usuario);
  let esAdmin = $derived(usuarioActual?.rol === 'admin');

  async function cargarUsuarios() {
    cargando = true;
    error = '';

    const params = new URLSearchParams({
      pagina: String(pagina),
      limite: '10',
    });
    if (busqueda) params.set('busqueda', busqueda);
    if (filtroRol) params.set('rol', filtroRol);

    try {
      const data = await api<{ usuarios: Usuario[]; paginacion: Paginacion }>(
        `/usuarios?${params}`
      );
      usuarios = data.usuarios;
      paginacion = data.paginacion;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar usuarios';
    } finally {
      cargando = false;
    }
  }

  onMount(() => {
    cargarUsuarios();
  });

  function abrirCrear() {
    modoEdicion = false;
    usuarioEditando = null;
    formNombre = '';
    formEmail = '';
    formPassword = '';
    formRol = 'visor';
    formActivo = true;
    modalAbierto = true;
  }

  function abrirEditar(usuario: Usuario) {
    modoEdicion = true;
    usuarioEditando = usuario;
    formNombre = usuario.nombre;
    formEmail = usuario.email;
    formPassword = '';
    formRol = usuario.rol;
    formActivo = usuario.activo ?? true;
    modalAbierto = true;
  }

  function cerrarModal() {
    modalAbierto = false;
  }

  async function guardarUsuario(e: Event) {
    e.preventDefault();
    guardando = true;
    error = '';
    mensaje = '';

    try {
      if (modoEdicion && usuarioEditando?._id) {
        const body: Record<string, unknown> = {
          nombre: formNombre,
          email: formEmail,
          rol: formRol,
          activo: formActivo,
        };
        if (formPassword) body.password = formPassword;

        await api(`/usuarios/${usuarioEditando._id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        mensaje = 'Usuario actualizado correctamente';
      } else {
        await api('/usuarios', {
          method: 'POST',
          body: JSON.stringify({
            nombre: formNombre,
            email: formEmail,
            password: formPassword,
            rol: formRol,
          }),
        });
        mensaje = 'Usuario creado correctamente';
      }

      cerrarModal();
      await cargarUsuarios();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar usuario';
    } finally {
      guardando = false;
    }
  }

  async function eliminarUsuario(usuario: Usuario) {
    if (!confirm(`¿Eliminar a ${usuario.nombre}?`)) return;

    try {
      await api(`/usuarios/${usuario._id}`, { method: 'DELETE' });
      mensaje = 'Usuario eliminado correctamente';
      await cargarUsuarios();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar usuario';
    }
  }

  function buscar() {
    pagina = 1;
    cargarUsuarios();
  }

  function cambiarPagina(nueva: number) {
    pagina = nueva;
    cargarUsuarios();
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>Usuarios</h1>
      <p>Gestiona los usuarios del sistema</p>
    </div>
    {#if esAdmin}
      <button class="btn btn-primary" onclick={abrirCrear}>+ Nuevo usuario</button>
    {/if}
  </header>

  {#if mensaje}
    <div class="alert alert-success">{mensaje}</div>
  {/if}

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="filtros card">
    <input
      class="input"
      type="search"
      placeholder="Buscar por nombre o correo..."
      bind:value={busqueda}
      onkeydown={(e) => e.key === 'Enter' && buscar()}
    />
    <select class="select" bind:value={filtroRol} onchange={buscar}>
      <option value="">Todos los roles</option>
      <option value="admin">Administrador</option>
      <option value="editor">Editor</option>
      <option value="visor">Visor</option>
    </select>
    <button class="btn btn-secondary" onclick={buscar}>Buscar</button>
  </div>

  <div class="card tabla-container">
    {#if cargando}
      <p class="estado">Cargando usuarios...</p>
    {:else if usuarios.length === 0}
      <p class="estado">No se encontraron usuarios</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último acceso</th>
              {#if esAdmin}
                <th>Acciones</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each usuarios as usuario}
              <tr>
                <td>{usuario.nombre}</td>
                <td>{usuario.email}</td>
                <td><span class="badge badge-{usuario.rol}">{etiquetaRol(usuario.rol)}</span></td>
                <td>
                  <span class="badge {usuario.activo ? 'badge-activo' : 'badge-inactivo'}">
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>{formatearFecha(usuario.ultimoAcceso)}</td>
                {#if esAdmin}
                  <td class="acciones">
                    <button class="btn btn-secondary btn-sm" onclick={() => abrirEditar(usuario)}>
                      Editar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick={() => eliminarUsuario(usuario)}>
                      Eliminar
                    </button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if paginacion && paginacion.paginas > 1}
        <div class="paginacion">
          <button
            class="btn btn-secondary"
            disabled={pagina <= 1}
            onclick={() => cambiarPagina(pagina - 1)}
          >
            Anterior
          </button>
          <span>Página {paginacion.pagina} de {paginacion.paginas}</span>
          <button
            class="btn btn-secondary"
            disabled={pagina >= paginacion.paginas}
            onclick={() => cambiarPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<Modal abierto={modalAbierto} titulo={modoEdicion ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={cerrarModal}>
  <form onsubmit={guardarUsuario}>
    <div class="form-group">
      <label class="label" for="nombre">Nombre</label>
      <input id="nombre" class="input" bind:value={formNombre} required />
    </div>

    <div class="form-group">
      <label class="label" for="email">Correo electrónico</label>
      <input id="email" class="input" type="email" bind:value={formEmail} required />
    </div>

    <div class="form-group">
      <label class="label" for="password">
        Contraseña {modoEdicion ? '(dejar vacío para no cambiar)' : ''}
      </label>
      <input
        id="password"
        class="input"
        type="password"
        bind:value={formPassword}
        required={!modoEdicion}
        minlength="6"
      />
    </div>

    <div class="form-group">
      <label class="label" for="rol">Rol</label>
      <select id="rol" class="select" bind:value={formRol}>
        <option value="admin">Administrador</option>
        <option value="editor">Editor</option>
        <option value="visor">Visor</option>
      </select>
    </div>

    {#if modoEdicion}
      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" bind:checked={formActivo} />
          Usuario activo
        </label>
      </div>
    {/if}

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={cerrarModal}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={guardando}>
        {guardando ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
    gap: 1rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .alert {
    margin-bottom: 1rem;
  }

  .filtros {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .tabla-container {
    padding: 0;
    overflow: hidden;
  }

  .estado {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .acciones {
    display: flex;
    gap: 0.5rem;
  }

  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  .paginacion {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .filtros {
      grid-template-columns: 1fr;
    }

    .page-header {
      flex-direction: column;
    }
  }
</style>
