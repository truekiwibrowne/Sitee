// Device wrapper (see CLAUDE.md "App Store and Google Play"): store builds swap in the
// native camera plugin. On the web, `capture` opens the rear camera straight away on
// phones. Some Android browsers still offer the gallery; the server-side duplicate-photo
// check and GPS/time stamps cover that until the native camera lands.

/** Opens the camera and resolves with the photo, or null if the person backs out. */
export function takePhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
