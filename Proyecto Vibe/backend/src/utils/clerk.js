import { createClerkClient } from '@clerk/backend';

let cliente = null;

export function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY no configurada');
  }

  if (!cliente) {
    cliente = createClerkClient({ secretKey });
  }

  return cliente;
}
