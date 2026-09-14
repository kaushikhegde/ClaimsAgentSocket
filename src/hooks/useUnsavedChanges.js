import { useCallback, useEffect, useState } from 'react';
import { setLeaveGuard } from '../navigationGuard';

// `key`/`uid` are React identity fields generated in the browser; they never mean the user changed anything.
const snapshotOf = (value) => JSON.stringify(value, (k, v) => (k === 'key' || k === 'uid' ? undefined : v));

/**
 * Tracks whether `value` differs from the last saved snapshot and guards leaving
 * the page while it does: browser reload/close, the sidebar (via navigationGuard)
 * and any link that calls the returned `confirmLeave`.
 */
export function useUnsavedChanges(value, message = 'You have unsaved changes. Leave without saving?') {
  const [snapshot, setSnapshot] = useState(() => snapshotOf(value));
  const isDirty = snapshotOf(value) !== snapshot;

  const markSaved = useCallback((saved) => setSnapshot(snapshotOf(saved)), []);
  const confirmLeave = useCallback(() => !isDirty || window.confirm(message), [isDirty, message]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    setLeaveGuard(() => window.confirm(message));
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      setLeaveGuard(null);
    };
  }, [isDirty, message]);

  return { isDirty, markSaved, confirmLeave };
}
