import { AsyncLocalStorage } from 'node:async_hooks';

// Marks a block of code as "run with the service role". Inside it, every
// table() call in supabase-store.ts uses the RLS-bypassing admin client.
// Scoped with AsyncLocalStorage so it can never leak into another request.
const scope = new AsyncLocalStorage<boolean>();

export function inServiceScope(): boolean {
  return scope.getStore() === true;
}

export function runWithServiceRole<T>(fn: () => Promise<T>): Promise<T> {
  return scope.run(true, fn);
}
