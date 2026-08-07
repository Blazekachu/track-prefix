import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema, seedSeries } from "./index";
import {
  getSeries,
  getSeriesById,
  upsertUtxo,
  getUtxosBySeries,
  getUtxoStats,
  markUtxoSpent,
  upsertInscription,
  getInscriptionsBySeries,
  getTraceState,
  updateTraceState,
  enqueueTrace,
  peekTrace,
  deleteTrace,
  getQueueSize,
  getTraceAccounting,
  getTraceGaps,
  deleteQueuedRangesCoveredByLiveUtxos,
} from "./queries";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  seedSeries(db);
});

afterEach(() => {
  db.close();
});

describe("series queries", () => {
  it("returns all 7 series", () => {
    const series = getSeries(db);
    expect(series).toHaveLength(7);
    expect(series[0].id).toBe(1);
    expect(series[0].sat_start).toBe("1773906020861562");
  });

  it("returns a single series by id", () => {
    const s = getSeriesById(db, 7);
    expect(s).not.toBeNull();
    expect(s!.sat_count).toBe(1);
    expect(s!.estimated_year).toBe("~2130");
  });
});

describe("utxo queries", () => {
  it("inserts and retrieves a UTXO", () => {
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qtest",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020871562",
      sat_count: 10000,
      spent: false,
      input_offset: "0",
    });

    const utxos = getUtxosBySeries(db, 1);
    expect(utxos).toHaveLength(1);
    expect(utxos[0].address).toBe("bc1qtest");
    expect(utxos[0].sat_count).toBe(10000);
  });

  it("updates UTXO on conflict (upsert)", () => {
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qtest",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020871562",
      sat_count: 10000,
      spent: false,
      input_offset: "0",
    });
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qnew",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020871562",
      sat_count: 10000,
      spent: false,
      input_offset: "0",
    });

    const utxos = getUtxosBySeries(db, 1);
    expect(utxos).toHaveLength(1);
    expect(utxos[0].address).toBe("bc1qnew");
  });

  it("marks UTXO as spent", () => {
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qtest",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020871562",
      sat_count: 10000,
      spent: false,
      input_offset: "0",
    });
    markUtxoSpent(db, "abc123:0");

    const utxos = getUtxosBySeries(db, 1);
    expect(utxos[0].spent).toBe(1);
  });

  it("computes stats", () => {
    upsertUtxo(db, {
      outpoint: "abc:0",
      address: "bc1qa",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020961562",
      sat_count: 100000,
      spent: false,
      input_offset: "0",
    });
    upsertUtxo(db, {
      outpoint: "def:1",
      address: "bc1qb",
      sat_range_start: "1773906020961563",
      sat_range_end: "1773906021061562",
      sat_count: 99999,
      spent: false,
      input_offset: "0",
    });

    const stats = getUtxoStats(db, 1);
    expect(stats.utxo_count).toBe(2);
    expect(stats.wallet_count).toBe(2);
    expect(stats.total_sats).toBe(199999);
  });
});

describe("inscription queries", () => {
  it("inserts and retrieves inscriptions", () => {
    upsertUtxo(db, {
      outpoint: "abc:0",
      address: "bc1qa",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020871562",
      sat_count: 10000,
      spent: false,
      input_offset: "0",
    });

    upsertInscription(db, {
      sat_number: "1773906020861600",
      inscription_id: "abc123i0",
      content_type: "text/html",
      utxo_outpoint: "abc:0",
    });

    const inscriptions = getInscriptionsBySeries(db, 1);
    expect(inscriptions).toHaveLength(1);
    expect(inscriptions[0].inscription_id).toBe("abc123i0");
  });
});

describe("trace state", () => {
  it("returns null when no state exists", () => {
    expect(getTraceState(db)).toBeNull();
  });

  it("creates and updates trace state", () => {
    updateTraceState(db, {
      last_traced_txid: "tx123",
      last_traced_depth: 5,
      total_utxos_found: 42,
      fee_sats_retraced: "12345",
      status: "running",
    });

    const state = getTraceState(db);
    expect(state).not.toBeNull();
    expect(state!.last_traced_txid).toBe("tx123");
    expect(state!.status).toBe("running");
  });
});

describe("trace queue accounting", () => {
  it("peeks without deleting and deletes only when acknowledged", () => {
    enqueueTrace(db, "abc123:0", "1773906020861562", "1773906020861566", 0, "10");

    const item = peekTrace(db);
    expect(item).not.toBeNull();
    expect(item!.input_offset).toBe("10");
    expect(getQueueSize(db)).toBe(1);

    deleteTrace(db, item!.id);
    expect(getQueueSize(db)).toBe(0);
  });

  it("accounts for live and queued sats against the BHANG target", () => {
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qtest",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020861571",
      sat_count: 10,
      spent: false,
      input_offset: "0",
    });
    enqueueTrace(db, "def456:1", "1773906020861572", "1773906020861581", 1, "100");

    const accounting = getTraceAccounting(db, 1);
    expect(accounting.live_sats).toBe(10n);
    expect(accounting.queued_sats).toBe(10n);
    expect(accounting.accounted_sats).toBe(20n);
    expect(accounting.target_sats - accounting.gap_sats).toBe(20n);
  });

  it("reports missing coverage gaps across live and queued ranges", () => {
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qtest",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020861571",
      sat_count: 10,
      spent: false,
      input_offset: "0",
    });
    enqueueTrace(db, "def456:1", "1773906020861582", "1773906020861591", 1, "100");

    const gaps = getTraceGaps(db, 1);
    expect(gaps[0]).toEqual({
      start: 1773906020861572n,
      end: 1773906020861581n,
      count: 10n,
    });
  });

  it("removes queued ranges that are already covered by live UTXOs", () => {
    upsertUtxo(db, {
      outpoint: "abc123:0",
      address: "bc1qtest",
      sat_range_start: "1773906020861562",
      sat_range_end: "1773906020861581",
      sat_count: 20,
      spent: false,
      input_offset: "0",
    });
    enqueueTrace(db, "def456:1", "1773906020861567", "1773906020861571", 1, "100");
    enqueueTrace(db, "ghi789:2", "1773906020861582", "1773906020861586", 1, "100");

    expect(deleteQueuedRangesCoveredByLiveUtxos(db, 1)).toBe(1);
    expect(getQueueSize(db)).toBe(1);
  });
});
