import { openFile } from '../../../utils/fileDownload';

/** Opens an attached file and reports a failed delivery to its caller. */
export function openAttachment(f: { url: string; original_name: string }, onError: () => void): void {
  void openFile(f.url, f.original_name).catch(onError);
}
