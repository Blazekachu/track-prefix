"use client";

import { useMemo, useState } from "react";
import type { DataMode, TrackPrefixConfig } from "@/core/job-config";
import { MODE_CAPABILITIES } from "@/core/mode-copy";

type SeriesInfo = {
  id: number;
  nameLength: number;
  satCount: string;
  satStart: string;
  satEnd: string;
  mined: boolean;
};

const MODE_LABELS: Record<DataMode, string> = {
  public_api: MODE_CAPABILITIES.public_api.label,
  paid_api: MODE_CAPABILITIES.paid_api.label,
  btc_node: MODE_CAPABILITIES.btc_node.label,
  btc_ord: MODE_CAPABILITIES.btc_ord.label,
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
  const [cookiePath, setCookiePath] = useState("");
  const [cookieHint, setCookieHint] = useState<string | null>(null);
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [connOk, setConnOk] = useState(false);
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
      return Boolean(rpcUrl.trim() && rpcUser.trim() && rpcPassword);
    }
    if (mode === "btc_ord") {
      return Boolean(
        rpcUrl.trim() && rpcUser.trim() && rpcPassword && ordUrl.trim()
      );
    }
    return true;
  }

  /** Node modes require a successful Test connection before Next. */
  function canProceedFromCredentials(): boolean {
    if (mode === "btc_node" || mode === "btc_ord") {
      return credentialsReady() && connOk;
    }
    return credentialsReady();
  }

  async function fillFromCookie() {
    setError(null);
    setCookieHint(null);
    setConnMsg(null);
    setConnOk(false);
    setBusy(true);
    try {
      const res = await fetch("/api/bitcoin-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookiePath: cookiePath.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const paths =
          Array.isArray(json.defaultPaths) && json.defaultPaths.length
            ? ` Default path(s): ${json.defaultPaths.join(", ")}.`
            : "";
        throw new Error((json.error || "Could not read Bitcoin cookie.") + paths);
      }
      setRpcUser(json.rpcUser as string);
      setRpcPassword(json.rpcPassword as string);
      setCookieHint(
        `Filled from ${json.cookiePath as string}. Credentials stay on this machine.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setError(null);
    setConnMsg(null);
    setConnOk(false);
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
        const step = json.failedStep ? ` [${json.failedStep}]` : "";
        throw new Error(`${json.error || "Connection failed"}${step}`);
      }
      const parts = [
        `Ready to trace — tip ${json.tipHeight}`,
        json.chain ? `chain=${json.chain}` : null,
        json.txindex?.synced ? "txindex synced" : null,
        json.ord?.ok ? "ord reachable" : null,
      ].filter(Boolean);
      setConnMsg(parts.join(" · "));
      setConnOk(true);
    } catch (e) {
      setConnOk(false);
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
                  onChange={() => {
                    setMode(m);
                    setError(null);
                    setConnMsg(null);
                    setConnOk(false);
                    setCookieHint(null);
                  }}
                />
                {MODE_LABELS[m]}
                {disabled ? " — coming soon" : ""}
                {!disabled && (
                  <p className="text-xs text-terminal-dim mt-1 ml-5">
                    {MODE_CAPABILITIES[m].summary}
                  </p>
                )}
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
            <div className="space-y-3">
              <p className="text-xs sm:text-sm font-bold tracking-wide text-terminal-amber border border-terminal-amber/60 p-3 leading-relaxed">
                THIS TOOL RUNS LOCALLY ON YOUR MACHINE. IT ONLY READS FROM YOUR
                BTC NODE{mode === "btc_ord" ? " AND ORD" : ""}. IT NEVER WRITES
                TO BITCOIND OR ORD — IT ONLY WRITES TO THIS TRACKER&apos;S LOCAL
                DATABASE UNDER <code>data/jobs/</code>.
              </p>
              <div className="text-sm text-terminal-dim space-y-2 leading-relaxed">
                <p>
                  Needs mainnet bitcoind with <code>txindex=1</code> (Core 24+
                  recommended for Refresh spends). RPC user/password authenticate
                  to <em>your</em> node only and are stored in local{" "}
                  <code>config.json</code> — not uploaded anywhere.
                </p>
                <p>
                  Pre-filled URLs are common local defaults. Change them if your
                  node or ord listens on another host/port.
                </p>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-terminal-bright">
                  RPC URL — where bitcoind listens (default mainnet{" "}
                  <code>8332</code>)
                </span>
                <input
                  className="w-full bg-black border border-terminal-border p-2"
                  placeholder="http://127.0.0.1:8332"
                  value={rpcUrl}
                  onChange={(e) => {
                    setRpcUrl(e.target.value);
                    setConnOk(false);
                    setConnMsg(null);
                  }}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-terminal-bright">
                  RPC user — from <code>bitcoin.conf</code> (
                  <code>rpcuser</code>) or cookie user <code>__cookie__</code>
                </span>
                <input
                  className="w-full bg-black border border-terminal-border p-2"
                  placeholder="RPC user"
                  value={rpcUser}
                  onChange={(e) => {
                    setRpcUser(e.target.value);
                    setConnOk(false);
                    setConnMsg(null);
                  }}
                  autoComplete="username"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-terminal-bright">
                  RPC password — from <code>rpcpassword</code> or the{" "}
                  <code>.cookie</code> file (never shared defaults)
                </span>
                <input
                  className="w-full bg-black border border-terminal-border p-2"
                  placeholder="RPC password"
                  type="password"
                  value={rpcPassword}
                  onChange={(e) => {
                    setRpcPassword(e.target.value);
                    setConnOk(false);
                    setConnMsg(null);
                  }}
                  autoComplete="current-password"
                />
              </label>
              {mode === "btc_ord" && (
                <label className="block space-y-1">
                  <span className="text-xs text-terminal-bright">
                    ord URL — local ord HTTP (default often port{" "}
                    <code>80</code>)
                  </span>
                  <input
                    className="w-full bg-black border border-terminal-border p-2"
                    placeholder="http://127.0.0.1:80"
                    value={ordUrl}
                    onChange={(e) => {
                      setOrdUrl(e.target.value);
                      setConnOk(false);
                      setConnMsg(null);
                    }}
                  />
                </label>
              )}

              <div className="border border-terminal-border/80 p-3 space-y-2">
                <p className="text-xs text-terminal-dim">
                  Optional: fill user/password from Bitcoin Core&apos;s{" "}
                  <code>.cookie</code> file. Nothing is read until you click the
                  button.
                </p>
                <input
                  className="w-full bg-black border border-terminal-border p-2 text-xs"
                  placeholder="Cookie path (leave blank for default)"
                  value={cookiePath}
                  onChange={(e) => setCookiePath(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-1 border border-terminal-border text-terminal-dim text-xs hover:text-terminal-green hover:border-terminal-green/50"
                  disabled={busy}
                  onClick={() => void fillFromCookie()}
                >
                  {busy ? "Reading…" : "Fill from Bitcoin cookie"}
                </button>
                {cookieHint && (
                  <p className="text-xs text-terminal-green">{cookieHint}</p>
                )}
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  className={`px-3 py-1 border text-xs ${
                    credentialsReady()
                      ? "border-terminal-amber text-terminal-amber"
                      : "border-terminal-border text-terminal-dim opacity-50 cursor-not-allowed"
                  }`}
                  disabled={busy || !credentialsReady()}
                  onClick={() => void testConnection()}
                  title={
                    credentialsReady()
                      ? "Verify RPC (and ord) so the tracer can run"
                      : "Fill all required fields first"
                  }
                >
                  {busy ? "Testing…" : "Test connection"}
                </button>
                {!credentialsReady() && (
                  <p className="text-xs text-terminal-dim">
                    Fill every field above before testing. This checks
                    reachability, mainnet, txindex
                    {mode === "btc_ord" ? ", and ord" : ""}.
                  </p>
                )}
                {connMsg && (
                  <p
                    className={`text-xs ${
                      connOk ? "text-terminal-green" : "text-terminal-red"
                    }`}
                  >
                    {connMsg}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <button
              type="button"
              className="px-4 py-2 border border-terminal-border"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className={`px-4 py-2 border border-terminal-green text-terminal-green ${
                !canProceedFromCredentials()
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
              onClick={() => setStep(3)}
              disabled={!canProceedFromCredentials()}
              title={
                mode === "btc_node" || mode === "btc_ord"
                  ? connOk
                    ? "Continue"
                    : "Run Test connection successfully before continuing"
                  : undefined
              }
            >
              Next
            </button>
            {(mode === "btc_node" || mode === "btc_ord") && !connOk && (
              <span className="text-xs text-terminal-dim">
                Next unlocks after a successful Test connection.
              </span>
            )}
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
