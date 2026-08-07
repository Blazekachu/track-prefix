/**
 * Ordinal FIFO transfer logic.
 *
 * When a transaction spends inputs, sats flow to outputs in order:
 * all sats from input 0, then input 1, etc. fill output 0 until full,
 * then output 1, etc. Fee sats are destroyed (not assigned to any output).
 */

export interface SatRange {
  start: bigint;
  end: bigint; // inclusive
}

export interface TxShape {
  inputs: Array<{ value: number }>;
  outputs: Array<{ value: number }>;
  fee: number;
}

/**
 * Given a transaction shape and the sat ranges that the inputs carry,
 * compute which sat ranges land in each output.
 *
 * inputRanges[i] corresponds to inputs[i].
 * Returns an array indexed by output index. Each entry is the SatRange
 * that landed in that output (or undefined if no tracked sats landed there).
 *
 * NOTE: This simplified version assumes each input carries at most one
 * contiguous tracked range.
 */
export function mapSatRanges(
  tx: TxShape,
  inputRanges: SatRange[]
): (SatRange | undefined)[] {
  // Step 1: Compute the absolute offset of each input within the combined input stream.
  const inputOffsets: bigint[] = [];
  let offset = 0n;
  for (const inp of tx.inputs) {
    inputOffsets.push(offset);
    offset += BigInt(inp.value);
  }

  // Step 2: For each input range, compute stream-position of tracked sats.
  type StreamRange = { streamStart: bigint; streamEnd: bigint; satStart: bigint };
  const trackedInStream: StreamRange[] = [];

  for (let i = 0; i < inputRanges.length; i++) {
    const range = inputRanges[i];
    if (!range) continue;
    const rangeSize = range.end - range.start + 1n;
    trackedInStream.push({
      streamStart: inputOffsets[i],
      streamEnd: inputOffsets[i] + rangeSize - 1n,
      satStart: range.start,
    });
  }

  // Step 3: Compute output boundaries in the stream.
  const outputBounds: Array<{ streamStart: bigint; streamEnd: bigint }> = [];
  let outOffset = 0n;
  for (const out of tx.outputs) {
    const size = BigInt(out.value);
    outputBounds.push({ streamStart: outOffset, streamEnd: outOffset + size - 1n });
    outOffset += size;
  }

  // Step 4: For each output, intersect with tracked stream ranges.
  const result: (SatRange | undefined)[] = [];

  for (const ob of outputBounds) {
    let mappedRange: SatRange | undefined;

    for (const tr of trackedInStream) {
      const intStart = tr.streamStart > ob.streamStart ? tr.streamStart : ob.streamStart;
      const intEnd = tr.streamEnd < ob.streamEnd ? tr.streamEnd : ob.streamEnd;

      if (intStart <= intEnd) {
        const satStart = tr.satStart + (intStart - tr.streamStart);
        const satEnd = tr.satStart + (intEnd - tr.streamStart);

        if (!mappedRange) {
          mappedRange = { start: satStart, end: satEnd };
        } else {
          if (satStart < mappedRange.start) mappedRange.start = satStart;
          if (satEnd > mappedRange.end) mappedRange.end = satEnd;
        }
      }
    }

    result.push(mappedRange);
  }

  return result;
}
