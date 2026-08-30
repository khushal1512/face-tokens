/** Either<ZswapCoinPublicKey, ContractAddress> as returned by the ledger. */
export interface LedgerEither {
  is_left: boolean;
  left?: { bytes: Uint8Array };
  right?: { bytes: Uint8Array };
}

export function formatAddress(either: LedgerEither | null | undefined): string {
  if (!either) return 'unknown';
  const bytes = either.is_left ? either.left?.bytes : either.right?.bytes;
  if (!bytes) return 'unknown';
  return '0x' + toHex(bytes);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`Not a hex string: ${hex.slice(0, 24)}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
