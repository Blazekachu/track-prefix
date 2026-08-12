"use client";

import { useState, useEffect, useRef } from "react";

export type TipState =
  | { status: "ok"; height: number; source: string }
  | { status: "error"; error: string };

export async function fetchTipHeight(): Promise<TipState> {
  try {
    const res = await fetch("/api/block-height");
    const data = (await res.json()) as {
      ok?: boolean;
      height?: unknown;
      source?: unknown;
      error?: unknown;
    };
    if (res.ok && data.ok !== false) {
      const height = Number(data.height);
      const source = typeof data.source === "string" ? data.source : "public explorer";
      if (Number.isFinite(height) && height > 0) {
        return { status: "ok", height, source };
      }
      return {
        status: "error",
        error: "Public explorers returned an invalid block height.",
      };
    }
    const error =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : "Could not fetch block height from mempool.space or other public explorers.";
    return { status: "error", error };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      error: `Local /api/block-height request failed: ${reason}`,
    };
  }
}

export function useBlockHeight() {
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const bestRef = useRef<number>(0);

  useEffect(() => {
    async function fetchHeight() {
      const result = await fetchTipHeight();
      if (result.status === "ok") {
        if (result.height >= bestRef.current) {
          bestRef.current = result.height;
          setBlockHeight(result.height);
        }
        setSource(result.source);
        setError(null);
        setConnected(true);
        return;
      }
      if (bestRef.current === 0) {
        setBlockHeight(null);
        setSource(null);
        setConnected(false);
      }
      setError(result.error);
    }
    void fetchHeight();

    const poll = setInterval(() => void fetchHeight(), 60000);
    return () => clearInterval(poll);
  }, []);

  return { blockHeight, source, error, connected };
}
