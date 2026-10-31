import type { Gps } from '@site-streak/shared';

// Device wrapper: store builds swap in the native geolocation plugin.

/** Best-effort current position. Resolves null if denied, unavailable or slow. */
export function currentPosition(timeoutMs = 8000): Promise<Gps | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        }),
      () => resolve(null),
      // A position up to a minute old is fine on site and avoids waiting for a fresh fix.
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
