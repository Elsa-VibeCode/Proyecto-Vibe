function parsearListaEmails(valor) {
  if (!valor?.trim()) return new Set();
  return new Set(
    valor
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

const ADMIN_EMAILS = parsearListaEmails(process.env.ADMIN_EMAILS);
const EDITOR_EMAILS = parsearListaEmails(process.env.EDITOR_EMAILS);

export function rolPorEmail(email) {
  const normalizado = String(email ?? '').trim().toLowerCase();
  if (!normalizado) return null;
  if (normalizado === 'admin@ejemplo.com' || ADMIN_EMAILS.has(normalizado)) {
    return 'admin';
  }
  if (EDITOR_EMAILS.has(normalizado)) {
    return 'editor';
  }
  return null;
}

export function aplicarRolPorEmail(usuario) {
  const rolAsignado = rolPorEmail(usuario.email);
  if (!rolAsignado) return usuario;
  if (usuario.rol !== rolAsignado) {
    usuario.rol = rolAsignado;
  }
  return usuario;
}
