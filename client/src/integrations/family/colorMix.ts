/** A 6-digit hex can take an alpha suffix. A CSS variable cannot. */
export function withHexAlpha(color: string, alphaHex: string): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    return `${expanded}${alphaHex}`;
  }
  const alpha = Number.parseInt(alphaHex, 16);
  const percent = Number.isFinite(alpha) ? Math.round((alpha / 255) * 100) : 12;
  return `color-mix(in srgb, ${hex} ${percent}%, transparent)`;
}
