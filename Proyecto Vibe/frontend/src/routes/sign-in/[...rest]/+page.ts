export const prerender = true;

/** Rutas de Clerk que deben existir en el sitio estático */
export function entries() {
  return [
    { rest: '' },
    { rest: 'verify-email-address' },
    { rest: 'sso-callback' },
    { rest: 'continue' },
    { rest: 'reset-password' },
    { rest: 'forgot-password' },
    { rest: 'factor-one' },
    { rest: 'factor-two' },
  ];
}
