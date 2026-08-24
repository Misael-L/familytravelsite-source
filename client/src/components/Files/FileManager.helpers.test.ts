import { describe, it, expect, vi } from 'vitest';
import { isWalletPass, isDirectFileUrl } from './FileManager.helpers';
import { resolveFileActionUrl } from './fileManagerOps';

describe('isWalletPass (#1447)', () => {
  it('detects by extension when the mime is unreliable', () => {
    // Browsers frequently send octet-stream / empty for .pkpass uploads
    expect(isWalletPass('application/octet-stream', 'boarding.pkpass')).toBe(true);
    expect(isWalletPass(null, 'multi.pkpasses')).toBe(true);
    expect(isWalletPass('', 'CAPS.PKPASS')).toBe(true);
  });

  it('falls back to the wallet MIME types when there is no extension', () => {
    expect(isWalletPass('application/vnd.apple.pkpass', 'pass')).toBe(true);
    expect(isWalletPass('application/vnd.apple.pkpasses', null)).toBe(true);
  });

  it('is false for non-wallet files', () => {
    expect(isWalletPass('application/pdf', 'report.pdf')).toBe(false);
    expect(isWalletPass('image/png', 'photo.png')).toBe(false);
    expect(isWalletPass('text/markdown', 'notes.md')).toBe(false);
    expect(isWalletPass(null, null)).toBe(false);
  });
});

describe('resolveFileActionUrl', () => {
  const file = {
    id: 'f1',
    trip_id: 't1',
    filename: 'a.pdf',
    original_name: 'a.pdf',
    mime_type: 'application/pdf',
    created_at: '2026-01-01T00:00:00Z',
    url: 'https://stale.example/a.pdf',
  }

  it('returns file.url when Nest omits a resolver', async () => {
    await expect(resolveFileActionUrl(file)).resolves.toBe('https://stale.example/a.pdf')
  })

  it('calls the Family resolver on every action', async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce('https://signed.example/1')
      .mockResolvedValueOnce('https://signed.example/2')
    await expect(resolveFileActionUrl(file, resolve)).resolves.toBe('https://signed.example/1')
    await expect(resolveFileActionUrl(file, resolve)).resolves.toBe('https://signed.example/2')
    expect(resolve).toHaveBeenCalledTimes(2)
  })
});

describe('isDirectFileUrl', () => {
  it('treats signed https and blob URLs as already resolved', () => {
    expect(isDirectFileUrl('https://example.supabase.co/storage/v1/object/sign/x')).toBe(true);
    expect(isDirectFileUrl('blob:http://localhost/1')).toBe(true);
    expect(isDirectFileUrl('/uploads/trips/1/a.pdf')).toBe(false);
  });
});
