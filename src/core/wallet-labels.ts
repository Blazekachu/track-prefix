/**
 * Optional address → label map for known wallets.
 * Keep empty by default for the public product; add only confirmed labels.
 */
export const WALLET_LABELS: Record<
  string,
  { label: string; kind: string }
> = {};

export function getWalletLabel(
  address: string
): { label: string; kind: string } | null {
  return WALLET_LABELS[address] ?? null;
}
