"use client";

import { useBlockHeight } from "./use-block-height";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const { blockHeight, source, error, connected } = useBlockHeight();
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
    <header className="flex items-center justify-between px-6 py-4 border-b border-terminal-border gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-terminal-green text-xl font-bold tracking-wider">
          TRACK PREFIX
        </h1>
        <span className="text-terminal-dim text-xs">v1.0</span>
      </div>
      <div className="flex items-center gap-4 text-sm min-w-0">
        <ThemeToggle />
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              connected ? "bg-terminal-green" : "bg-terminal-red"
            }`}
          />
          <span className="text-terminal-dim shrink-0">BLOCK</span>
          {blockHeight != null ? (
            <span className="text-terminal-bright font-bold" title={source ?? undefined}>
              {blockHeight.toLocaleString("en-US")}
            </span>
          ) : error ? (
            <span className="text-terminal-red text-xs truncate" title={error}>
              {error}
            </span>
          ) : (
            <span className="text-terminal-dim">loading...</span>
          )}
        </div>
        <span className="text-terminal-dim shrink-0">{time}</span>
      </div>
    </header>
  );
}