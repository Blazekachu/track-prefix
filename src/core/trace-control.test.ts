import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  controlPath,
  writeControl,
  readControl,
  clearControl,
} from "./trace-control";

describe("trace-control", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tp-ctrl-"));

  beforeEach(() => {
    process.env.DATABASE_PATH = path.join(dir, "test.db");
    clearControl();
  });

  afterEach(() => {
    clearControl();
    delete process.env.DATABASE_PATH;
  });

  it("defaults to run", () => {
    expect(readControl()).toBe("run");
  });

  it("round-trips pause", () => {
    writeControl("pause");
    expect(readControl()).toBe("pause");
    expect(fs.existsSync(controlPath())).toBe(true);
  });
});
