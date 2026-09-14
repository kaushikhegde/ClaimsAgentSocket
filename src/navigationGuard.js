// Lets a page with unsaved changes veto navigation started from shared chrome
// (the sidebar). The app uses <BrowserRouter>, which has no useBlocker, so links
// outside the page ask this guard before navigating.
let guard = null;

/** Register `fn` (returns true to allow leaving) or pass null to clear. */
export function setLeaveGuard(fn) {
  guard = fn;
}

/** True when navigation may proceed. */
export function confirmLeave() {
  return guard ? guard() : true;
}
