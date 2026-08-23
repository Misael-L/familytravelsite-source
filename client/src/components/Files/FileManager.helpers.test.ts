import { describe, it, expect } from 'vitest';
import { isWalletPass, isDirectFileUrl } from './FileManager.helpers';

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

describe('isDirectFileUrl', () => {
  it('treats signed https and blob URLs as already resolved', () => {
    expect(isDirectFileUrl('https://example.supabase.co/storage/v1/object/sign/x')).toBe(true);
    expect(isDirectFileUrl('blob:http://localhost/1')).toBe(true);
    expect(isDirectFileUrl('/uploads/trips/1/a.pdf')).toBe(false);
  });
});
