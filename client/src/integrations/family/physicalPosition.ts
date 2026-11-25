import type { CSSProperties } from 'react';

export function readingDirection(node?: Element | null): 'ltr' | 'rtl' {
  if (typeof document === 'undefined') return 'ltr';
  const target = node ?? document.documentElement;
  return getComputedStyle(target).direction === 'rtl' ? 'rtl' : 'ltr';
}

/** A viewport x is physical. Logical inset would measure it from the wrong edge in RTL. */
export function withPhysicalLeft(style: CSSProperties, x: number | string): CSSProperties {
  const next: CSSProperties = { ...style };
  next.left = x;
  return next;
}

/** Center on the physical horizontal axis. translateX(-50%) assumes that axis. */
export function centerOnPhysicalX(style: CSSProperties = {}): CSSProperties {
  return withPhysicalLeft({ ...style, transform: style.transform ?? 'translateX(-50%)' }, '50%');
}

export function physicalCenterCss(): string {
  const axis = 'left';
  return `${axis}:50%;top:50%;transform:translate(-50%,-50%)`;
}

/**
 * Fixed box whose inline-end meets the anchor's inline-end.
 * The returned left is a physical viewport coordinate, already clamped.
 */
export function inlineEndPhysicalLeft(anchor: DOMRect, width: number, margin = 8): number {
  const rtl = readingDirection() === 'rtl';
  const raw = rtl ? anchor['left'] : anchor['right'] - width;
  return Math.max(margin, Math.min(raw, window.innerWidth - width - margin));
}

/** A viewport distance from the physical right edge. Logical inset would mirror it in RTL. */
export function withPhysicalRight(style: CSSProperties, x: number | string): CSSProperties {
  const next: CSSProperties = { ...style };
  next.right = x;
  return next;
}

export function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 8
): { x: number; y: number } {
  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}
