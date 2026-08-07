"use client";

import { useMemo, useState } from "react";
import type { DataMode, TrackPrefixConfig } from "@/core/job-config";

type SeriesInfo = {
  id: number;
  nameLength: number;
  satCount: string;
  satStart: string;
  satEnd: string;
  mined: boolean;
};

const MODE_LABELS: Record<DataMode, string> = {
  public_api: "Public API (no node)",
  paid_api: "Paid / subscribed API",
  btc_node: "BTC node (RPC)",
  btc_ord: "BTC node + ord",
};

export function Wizard({
  modeAvailability,
  onCancel,
}: {
  modeAvailability: Record<DataMode, "ready" | "coming_soon">;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<DataMode>("public_api");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rpcUrl, setRpcUrl] = useState("http://127.0.0.1:8332");
  const [rpcUser, setRpcUser] = useState("");
  const [rpcPassword, setRpcPassword] = useState("");
  const [ordUrl, setOrdUrl] = useState("http://127.0.0.1:80");
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [prefix, setPrefix] = useState("");
  const [tip, setTip] = useState<number | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => seriesList.find((s) => s.id === selectedSeriesId) ?? null,
    [seriesList, selectedSeriesId]
  );

  function modeCredentialsForSave(): TrackPrefixConfig["modeCredentials"] {
    if (mode === "paid_api") {
      return {
        apiBaseUrl: apiBaseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      };
    }
    if (mode === "btc_node" || mode === "btc_ord") {
      return {
        rpcUrl: rpcUrl.trim(),
        rpcUser: rpcUser.trim(),
        rpcPassword: rpcPassword,
        ...(mode === "btc_ord" ? { ordUrl: ordUrl.trim() } : {}),
      };
    }
    return {};
  }

  function credentialsReady(): boolean {
    if (mode === "paid_api") return Boolean(apiBaseUrl.trim());
    if (mode === "btc_node") {
      return Boolean(rpcUrl.trim() && rpcUser.trim());
    }
    if (mode === "btc_ord") {
      return Boolean(rpcUrl.trim() && rpcUser.trim() && ordUrl.trim());
    }
    return true;
  }

  async function testConnection() {
    setError(null);
    setConnMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/provider-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          modeCredentials: modeCredentialsForSave(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Connection failed");
      }
      const parts = [
        `OK — tip ${json.tipHeight}`,
        json.chain ? `chain=${json.chain}` : null,
        json.ord?.ok ? "ord reachable" : null,
      ].filter(Boolean);
      setConnMsg(parts.join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadSeries() {
    setError(null);
    setBusy(true);
    try {
      let height: number;
      if (mode === "btc_node" || mode === "btc_ord") {
        const tipRes = await fetch("/api/provider-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            modeCredentials: modeCredentialsForSave(),
          }),
        });
        const tipJson = await tipRes.json();
        if (!tipRes.ok || !tipJson.ok) {
          throw new Error(tipJson.error || "Failed to fetch tip from node");
        }
        height = tipJson.tipHeight as number;
      } else {
        const tipRes = await fetch("/api/tip");
        const tipJson = await tipRes.json();
        if (!tipRes.ok) throw new Error(tipJson.error || "Failed to fetch tip");
        height = tipJson.height as number;
      }
      setTip(height);

      const seriesRes = await fetch(
        `/api/series-preview?prefix=${encodeURIComponent(prefix.trim())}&tip=${height}`
      );
      const seriesJson = await seriesRes.json();
      if (!seriesRes.ok) throw new Error(seriesJson.error || "Failed to list series");
      setSeriesList(seriesJson.series as SeriesInfo[]);
      setSelectedSeriesId(null);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!selected || tip == null) return;
    if (!selected.mined) {
      setError("Only mined series can be tracked.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: TrackPrefixConfig = {
        version: 1,
        wizardComplete: true,
        mode,
        modeCredentials: modeCredentialsForSave(),
        modeAvailability,
        job: {
          prefix: prefix.trim().toLowerCase(),
          seriesId: selected.id,
          nameLength: selected.nameLength,
          satStart: selected.satStart,
          satEnd: selected.satEnd,
          satCount: selected.satCount,
          tipHeightAtStart: tip,
        },
      };
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save config");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-terminal-green text-2xl font-bold tracking-wider">
        track-prefix setup
      </h1>
      {onCancel && (
        <button
          type="button"
          className="text-xs text-terminal-dim underline"
          onClick={onCancel}
        >
          ← Back to job list
        </button>
      )}

      {step === 0 && (
        <section className="space-y-4 text-sm leading-relaxed">
          <p>
            This app runs a <strong>local FIFO sat tracer</strong> for one mined
            sat-name prefix series. A browser alone cannot finish a multi-day
            sync — the worker must run on your machine.
          </p>
          <p>
            &quot;Complete&quot; means conservation accounting reaches gap 0 for
            the chosen sat range. Public APIs may rate-limit or ISP-ban long
            runs; own-node modes are safer when available.
          </p>
          <button
            type="button"
            className="px-4 py-2 border border-terminal-green text-terminal-green"
            onClick={() => setStep(1)}
          >
            Continue
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="text-terminal-bright">Choose data mode</h2>
          {(Object.keys(MODE_LABELS) as DataMode[]).map((m) => {
            const avail = modeAvailability[m];
            const disabled = avail !== "ready";
            return (
              <label
                key={m}
                className={`block border p-3 ${
                  disabled ? "opacity-50" : "cursor-pointer"
                } ${mode === m ? "border-terminal-green" : "border-terminal-border"}`}
              >
                <input
                  type="radio"
                  name="mode"
                  className="mr-2"
                  disabled={disabled}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {MODE_LABELS[m]}
                {disabled ? " — coming soon" : ""}
              </label>
            );
          })}
          <button
            type="button"
            className="px-4 py-2 border border-terminal-green text-terminal-green"
            onClick={() => setStep(2)}
          >
            Next
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="text-terminal-bright">Permissions / credentials</h2>
          {mode === "public_api" && (
            <p className="text-sm text-terminal-dim">
              Uses public Esplora endpoints. No keys required. Expect rate
              limits on large ranges.
            </p>
          )}
          {mode === "paid_api" && (
            <div className="space-y-2">
              <input
                className="w-full bg-black border border-terminal-border p-2"
                placeholder="API base URL (e.g. https://mempool.space/api)"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
              />
              <input
                className="w-full bg-black border border-terminal-border p-2"
                placeholder="API key (optional header)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          )}
          {(mode === "btc_node" || mode === "btc_ord") && (
            <div className="space-y-2">
              <p className="text-sm text-terminal-dim">
                Mainnet bitcoind with <code>txindex=1</code> (Core 24+ recommended
                for spend lookups). The track-prefix DB still lives under{" "}
                <code>data/jobs/</code> — the node is only a data source.
              </p>
              <input
                className="w-full bg-black border border-terminal-border p-2"
                placeholder="RPC URL (e.g. http://127.0.0.1:8332)"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
              />
              <input
                className="w-full bg-black border border-terminal-border p-2"
                placeholder="RPC user"
                value={rpcUser}
                onChange={(e) => setRpcUser(e.target.value)}
                autoComplete="username"
              />
              <input
                className="w-full bg-black border border-terminal-border p-2"
                placeholder="RPC password"
                type="password"
                value={rpcPassword}
                onChange={(e) => setRpcPassword(e.target.value)}
                autoComplete="current-password"
              />
              {mode === "btc_ord" && (
                <input
                  className="w-full bg-black border border-terminal-border p-2"
                  placeholder="ord URL (e.g. http://127.0.0.1:80)"
                  value={ordUrl}
                  onChange={(e) => setOrdUrl(e.target.value)}
                />
              )}
              <button
                type="button"
                className="px-3 py-1 border border-terminal-amber text-terminal-amber text-xs"
                disabled={busy || !credentialsReady()}
                onClick={() => void testConnection()}
              >
                {busy ? "Testing…" : "Test connection"}
              </button>
              {connMsg && (
                <p className="text-xs text-terminal-green">{connMsg}</p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 border border-terminal-border"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className="px-4 py-2 border border-terminal-green text-terminal-green"
              onClick={() => setStep(3)}
              disabled={!credentialsReady()}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h2 className="text-terminal-bright">Choose mined series</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-black border border-terminal-border p-2"
              placeholder="prefix (e.g. bhang)"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
            <button
              type="button"
              className="px-4 py-2 border border-terminal-green text-terminal-green"
              onClick={() => void loadSeries()}
              disabled={busy || !prefix.trim()}
            >
              {busy ? "Loading…" : "List series"}
            </button>
          </div>
          {tip != null && (
            <p className="text-xs text-terminal-dim">Tip height: {tip}</p>
          )}
          <ul className="space-y-2">
            {seriesList.map((s) => (
              <li key={s.id}>
                <label
                  className={`block border p-3 ${
                    !s.mined ? "opacity-50" : "cursor-pointer"
                  } ${
                    selectedSeriesId === s.id
                      ? "border-terminal-green"
                      : "border-terminal-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="series"
                    className="mr-2"
                    disabled={!s.mined}
                    checked={selectedSeriesId === s.id}
                    onChange={() => setSelectedSeriesId(s.id)}
                  />
                  Series {s.id} · {s.nameLength}-letter · {s.satCount} sats ·{" "}
                  {s.mined ? "mined" : "unmined (not trackable yet)"}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 border border-terminal-border"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              className="px-4 py-2 border border-terminal-green text-terminal-green"
              disabled={!selected?.mined}
              onClick={() => setStep(4)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {step === 4 && selected && (
        <section className="space-y-3 text-sm">
          <h2 className="text-terminal-bright">Expectations</h2>
          <p>
            Tracking <strong>{prefix}</strong> series {selected.id} (
            {selected.satCount} sats). First sync on public APIs can take hours
            to weeks for large ranges. Refresh later is lighter. Rate limits /
            ISP blocks are possible.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 border border-terminal-border"
              onClick={() => setStep(3)}
            >
              Back
            </button>
            <button
              type="button"
              className="px-4 py-2 border border-terminal-green text-terminal-green"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : "Start tracking"}
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-terminal-red text-sm">{error}</p>}
    </main>
  );
}
