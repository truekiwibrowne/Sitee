// Device wrapper (see CLAUDE.md "App Store and Google Play"): a native haptics plugin
// replaces this in the store builds. iOS Safari has no vibration API, so it's a no-op there.

/** A light tap, e.g. when a task completes. */
export function tapHaptic() {
  navigator.vibrate?.(12);
}
