export const SUPPLY = 2_099_999_997_690_000n;

export function satToName(sat: bigint): string {
  let x = SUPPLY - sat;
  let name = "";
  while (x > 0n) {
    x -= 1n;
    name = String.fromCharCode(Number(x % 26n) + 97) + name;
    x = x / 26n;
  }
  return name;
}

export function nameToSat(name: string): bigint {
  let x = 0n;
  for (const ch of name) {
    x = x * 26n + BigInt(ch.charCodeAt(0) - 97) + 1n;
  }
  return SUPPLY - x;
}

export function satToBlock(sat: bigint): bigint {
  let remaining = sat;
  let subsidy = 5_000_000_000n;
  let height = 0n;
  for (let epoch = 0; epoch < 64; epoch++) {
    const epochSats = 210_000n * subsidy;
    if (remaining < epochSats) {
      return height + remaining / subsidy;
    }
    remaining -= epochSats;
    height += 210_000n;
    subsidy /= 2n;
  }
  return height;
}
