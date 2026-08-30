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

/**
 * Normalise a wallet's shielded coin public key to the 32 raw bytes a circuit
 * expects. The shape differs between wallet builds: 1AM 4.x hands back a hex
 * string, older builds hand back raw bytes or a `{ bytes }` wrapper.
 *
 * Bech32m-encoded keys (`mn_shield-cpk_...`) cannot be decoded here. Parsing
 * one as hex silently yields 32 zero bytes, which mints the token to nobody, so
 * we throw instead.
 */
export function coinPublicKeyToBytes(pk: unknown): Uint8Array {
  if (pk instanceof Uint8Array) {
    if (pk.length < 32) throw new Error(`Coin public key too short: ${pk.length} bytes`);
    return pk.length === 32 ? pk : pk.slice(0, 32);
  }
  if (Array.isArray(pk)) return coinPublicKeyToBytes(Uint8Array.from(pk as number[]));
  if (pk && typeof pk === 'object' && 'bytes' in pk) {
    return coinPublicKeyToBytes((pk as { bytes: unknown }).bytes);
  }
  if (typeof pk === 'string') {
    const clean = pk.startsWith('0x') ? pk.slice(2) : pk;
    if (clean.length === 64 && /^[0-9a-fA-F]+$/.test(clean)) return fromHex(clean);
    throw new Error(
      `Wallet returned a coin public key this dApp cannot decode ("${pk.slice(0, 16)}..."). ` +
        'Expected 32 bytes as hex. Update the wallet extension to a 4.x build.',
    );
  }
  throw new Error('Wallet returned no coin public key.');
}
