import type { WriterCoordination, WriterRole } from '../workspace/ports';

const lockName = 'jaswa-workspace-writer';
const channelName = 'jaswa-workspace';
/* A reload releases the old page's lock only as that page is torn down, so a
   fresh page briefly finds it taken. Waiting this long before settling as a
   reader keeps a single tab from ever announcing a second one. */
const settleAfter = 1_500;

/**
 * One writer per origin through the Web Locks API (`ARCHITECTURE-FROM-SCRATCH.md`
 * §10.4). The lock is held for the life of the page; a tab that does not get it
 * reads and waits in line, and takes over when the writer closes. Other tabs are
 * told only *that* something was committed, never what, and read it from storage.
 *
 * A browser without Web Locks cannot coordinate tabs at all; this tab then writes,
 * and the store says plainly that a second tab would compete with it.
 */
export function createWriterCoordination(): WriterCoordination {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  const roleListeners = new Set<(role: WriterRole) => void>();
  const commitListeners = new Set<() => void>();
  let role: WriterRole | null = null;
  let coordinated = Boolean(locks);
  let settle: (role: WriterRole) => void = () => {};
  const settled = new Promise<WriterRole>((resolve) => { settle = resolve; });

  function become(next: WriterRole) {
    if (role === next) return;
    const first = role === null;
    role = next;
    if (first) settle(next);
    else roleListeners.forEach((listener) => listener(next));
  }

  channel?.addEventListener('message', (event: MessageEvent) => {
    if (event.data === 'committed') commitListeners.forEach((listener) => listener());
  });

  if (!locks) {
    become('writer');
  } else {
    const timer = setTimeout(() => become('reader'), settleAfter);
    /* Queued, not `ifAvailable`: a reader is simply next in line. The promise the
       callback returns never settles, so the lock lives as long as the page. */
    void locks.request(lockName, () => {
      clearTimeout(timer);
      become('writer');
      return new Promise<never>(() => {});
    }).catch(() => {
      /* A refused lock request coordinates nothing: this tab writes, and says so. */
      clearTimeout(timer);
      coordinated = false;
      become('writer');
    });
  }

  return {
    ready: () => settled,
    getRole: () => role,
    isCoordinated: () => coordinated,
    onRoleChange(listener) {
      roleListeners.add(listener);
      return () => roleListeners.delete(listener);
    },
    announceCommit() {
      channel?.postMessage('committed');
    },
    onRemoteCommit(listener) {
      commitListeners.add(listener);
      return () => commitListeners.delete(listener);
    },
  };
}
