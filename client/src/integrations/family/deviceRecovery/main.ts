import { beginUnattributedRecovery } from '../../../sync/unattributedWorkExport';
import { familyDeviceRecoveryAvailable } from '../deviceRecoveryGate';
import './style.css';

type Prepared = Awaited<ReturnType<ReturnType<typeof beginUnattributedRecovery>['prepare']>>;
function triggerDeviceDownload(prepared: Prepared, urls: Set<string>) {
  prepared.assertCurrent();
  const url = URL.createObjectURL(prepared.blob),
    anchor = document.createElement('a');
  urls.add(url);
  anchor.href = url;
  anchor.download = prepared.filename;
  document.body.appendChild(anchor);
  try {
    prepared.assertCurrent();
    anchor.click();
  } finally {
    anchor.remove();
  }
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    urls.delete(url);
  }, 1000);
}
export function mountDeviceRecovery(root: HTMLElement) {
  const find = <T extends HTMLElement>(selector: string) => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error('Device recovery document is incomplete.');
    return node;
  };
  const consent = find<HTMLInputElement>('#recovery-consent'),
    scan = find<HTMLButtonElement>('#recovery-scan');
  const select = find<HTMLSelectElement>('#recovery-database'),
    inspect = find<HTMLButtonElement>('#recovery-inspect');
  const download = find<HTMLButtonElement>('#recovery-download'),
    status = find('#recovery-status'),
    summary = find('#recovery-summary');
  let session: ReturnType<typeof beginUnattributedRecovery> | undefined;
  let prepared: Awaited<ReturnType<NonNullable<typeof session>['prepare']>> | undefined;
  let epoch = 0;
  const urls = new Set<string>();
  const clearReady = () => {
    prepared = undefined;
    summary.textContent = '';
    download.disabled = true;
  };
  const cancel = () => {
    epoch++;
    session?.cancel();
    session = undefined;
    clearReady();
    select.replaceChildren(new Option('Choose one database after scanning', ''));
    select.disabled = true;
    inspect.disabled = true;
    consent.checked = false;
    scan.disabled = true;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    status.textContent = 'Recovery cancelled. Nothing was changed or removed.';
  };
  consent.addEventListener('change', () => {
    if (!consent.checked) cancel();
    else scan.disabled = false;
  });
  scan.addEventListener('click', () => {
    if (!consent.checked) return;
    session?.cancel();
    clearReady();
    select.replaceChildren(new Option('Choose one database', ''));
    select.disabled = true;
    inspect.disabled = true;
    const ticket = ++epoch;
    scan.disabled = true;
    session = beginUnattributedRecovery({ consented: consent.checked, origin: location.origin });
    status.textContent = 'Listing unattributed database names only…';
    void session
      .discover()
      .then((names) => {
        if (epoch !== ticket) return;
        for (const name of names) select.add(new Option(name, name));
        select.disabled = names.length === 0;
        status.textContent = names.length
          ? 'Choose one unattributed database to inspect.'
          : 'No eligible unattributed database was found. Other databases were not inspected.';
      })
      .catch(() => {
        if (epoch === ticket)
          status.textContent = 'Device discovery was refused. Preserve this browser profile; nothing was changed.';
      });
  });
  select.addEventListener('change', () => {
    clearReady();
    inspect.disabled = !session || !select.value;
  });
  inspect.addEventListener('click', () => {
    if (!session || !select.value) return;
    clearReady();
    inspect.disabled = true;
    select.disabled = true;
    const ticket = ++epoch,
      selected = session;
    status.textContent = 'Preparing a readonly point-in-time copy…';
    void selected
      .prepare(select.value)
      .then((result) => {
        if (epoch !== ticket || session !== selected) return;
        result.assertCurrent();
        prepared = result;
        const s = result.summary;
        summary.textContent = `${s.database}: ${s.queue} commands, ${s.imports} imports; ${s.bytes} archive bytes. Excluded stores: ${s.excluded.join(', ')}.`;
        download.disabled = false;
        status.textContent = 'Unattributed local copy is ready. Review the counts before downloading.';
      })
      .catch(() => {
        if (epoch !== ticket) return;
        clearReady();
        status.textContent =
          'Recovery was refused. The database may be incompatible, owned, empty, too large or contain credential signatures. Nothing was changed or removed.';
      });
  });
  download.addEventListener('click', () => {
    if (!prepared) return;
    try {
      triggerDeviceDownload(prepared, urls);
      clearReady();
      session?.cancel();
      session = undefined;
      status.textContent =
        'An unattributed local copy was exported. Original work remains unchanged. This is not proof of restoration.';
    } catch {
      clearReady();
      status.textContent = 'The recovery context changed. Nothing was exported or removed.';
    }
  });
  find('#recovery-cancel').addEventListener('click', cancel);
  window.addEventListener('pagehide', cancel);
  navigator.serviceWorker?.addEventListener('controllerchange', cancel);
}
const root = document.getElementById('device-recovery');
if (root && familyDeviceRecoveryAvailable()) mountDeviceRecovery(root);
else if (root) root.textContent = 'Device recovery is unavailable in this build.';
