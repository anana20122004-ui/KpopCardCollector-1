export const DEFAULT_PASTEL_PROFILE_COLOR = '#F6C5D0';

export function isPastelHex(value: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return false;

  const red = parseInt(value.slice(1, 3), 16) / 255;
  const green = parseInt(value.slice(3, 5), 16) / 255;
  const blue = parseInt(value.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;

  return lightness >= 0.72;
}

export function getPastelProfileColor(value: unknown): string {
  return typeof value === 'string' && isPastelHex(value)
    ? value
    : DEFAULT_PASTEL_PROFILE_COLOR;
}
