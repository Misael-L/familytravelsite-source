/** Release download resources even when the browser rejects the handoff. */
function releaseDownload(url: string, anchor: HTMLAnchorElement, revoke: (url: string) => void) {
  try {
    revoke(url);
  } catch {
    /* Cleanup must not fail an accepted download. */
  }
  try {
    anchor.remove();
  } catch {
    /* The document may already have gone away. */
  }
}

/**
 * Check ownership before handing private bytes to the browser. After click, retain
 * the 100 ms Firefox/Safari pickup grace independently of React/menu lifetime.
 */
export function saveBlob(blob: Blob, filename: string, assertCurrent: () => void = () => {}) {
  assertCurrent();
  const anchor = document.createElement('a');
  const revoke = URL.revokeObjectURL.bind(URL);
  const url = URL.createObjectURL(blob);
  const release = () => releaseDownload(url, anchor, revoke);
  try {
    assertCurrent();
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    assertCurrent();
    anchor.click();
  } catch (error) {
    release();
    throw error;
  }
  try {
    setTimeout(release, 100);
  } catch {
    release();
  }
}
