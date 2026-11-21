/** Browser transport for the copied upstream weather service. */
export async function readCappedJson<T>(response: Response, limit: number): Promise<T | undefined> {
  if (Number(response.headers.get('content-length') ?? 0) > limit) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.body) return undefined;
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}
