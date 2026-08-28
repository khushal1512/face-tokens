export function formatAddress(either: any): string {
  if (!either) return '—';
  const bytes = either.is_left ? either.left?.bytes : either.right?.bytes;
  if (!bytes) return '—';
  return '0x' + Array.from(bytes as number[]).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
