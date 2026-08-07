"use client";

import { useState, useEffect, useRef } from "react";

const MEMPOOL_WS = "wss://mempool.space/api/v1/ws";
const MEMPOOL_API = "https://mempool.space/api/blocks/tip/height";

export function useBlockHeight() {
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bestRef = useRef<number>(0);

  function updateHeight(h: number) {
    if (h > bestRef.current) {
      bestRef.current = h;
      setBlockHeight(h);
    }
  }

  // Immediate HTTP fetch so we don't wait for WebSocket
  useEffect(() => {
    async function fetchHeight() {
      try {
        const res = await fetch(MEMPOOL_API);
        if (res.ok) {
          const height = parseInt(await res.text(), 10);
          if (!isNaN(height)) updateHeight(height);
        }
      } catch {
        // will retry via WebSocket or polling
      }
    }
    fetchHeight();

    // Poll every 60s as fallback if WebSocket drops
    const poll = setInterval(fetchHeight, 60000);
    return () => clearInterval(poll);
  }, []);

  // WebSocket for real-time updates
  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(MEMPOOL_WS);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          ws.send(JSON.stringify({ action: "want", data: ["blocks"] }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.block?.height) {
              updateHeight(data.block.height);
            }
            if (data.blocks?.length) {
              const maxH = Math.max(...data.blocks.map((b: { height: number }) => b.height));
              if (maxH) updateHeight(maxH);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          setConnected(false);
          setTimeout(connect, 10000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setConnected(false);
        setTimeout(connect, 10000);
      }
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { blockHeight, connected };
}
