/**
 * Tool calls parked until the person who asked for them says yes.
 *
 * The chat request awaits here, so the call never reaches the MCP server before
 * the decision. The registry is per process — correct for the single container
 * this app is deployed as, and it would need a shared store if it ever scales
 * past one.
 */
type Waiter = { resolve: (allow: boolean, reason?: string) => void };

const waiters = new Map<string, Waiter>();

/** Long enough to walk back to the tab, short enough to not hold a request open all day. */
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export function waitForApproval(id: string): Promise<{ allow: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      resolve({ allow: false, reason: "no answer in time" });
    }, APPROVAL_TIMEOUT_MS);

    waiters.set(id, {
      resolve: (allow, reason) => {
        clearTimeout(timer);
        waiters.delete(id);
        resolve({ allow, reason });
      },
    });
  });
}

/** Returns false when nothing was waiting — the call already timed out or ran. */
export function resolveApproval(id: string, allow: boolean): boolean {
  const waiter = waiters.get(id);
  if (!waiter) return false;
  waiter.resolve(allow, allow ? undefined : "the user denied this call");
  return true;
}
