import { browser } from '$app/environment';

type ClerkWindow = typeof window & {
  Clerk?: {
    loaded?: boolean;
    session?: {
      getToken: (options?: { template?: string }) => Promise<string | null>;
    };
  };
};

async function esperarClerk(maxIntentos = 20): Promise<ClerkWindow['Clerk'] | null> {
  if (!browser) return null;

  for (let i = 0; i < maxIntentos; i++) {
    const clerk = (window as ClerkWindow).Clerk;
    if (clerk?.session) return clerk;
    await new Promise((r) => setTimeout(r, 150));
  }

  return (window as ClerkWindow).Clerk ?? null;
}

export async function obtenerTokenClerk(): Promise<string | null> {
  const clerk = await esperarClerk();
  if (!clerk?.session) return null;

  return clerk.session.getToken();
}

export function esRutaPublica(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')
  );
}
