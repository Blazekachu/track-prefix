"use client";

import { useBlockHeight } from "./use-block-height";
import { useEffect, useState } from "react";

export function Header() {
  const { blockHeight, connected } = useBlockHeight();
  const [time, setTime] = useState("");

  useEffect(() => {
    function tick() {
      setTime(
        new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC"
      );
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-terminal-border">
      <div className="flex items-center gap-3">
        <h1 className="text-terminal-green text-xl font-bold tracking-wider">
          BHANG TRACKER
        </h1>
        <span className="text-terminal-dim text-xs">v1.0</span>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? "bg-terminal-green" : "bg-terminal-red"
            }`}
          />
          <span className="text-terminal-dim">BLOCK</span>
          <span className="text-terminal-bright font-bold">
            {blockHeight?.toLocaleString("en-US") ?? "---"}
          </span>
        </div>
        <span className="text-terminal-dim">{time}</span>
      </div>
    </header>
  );
}
