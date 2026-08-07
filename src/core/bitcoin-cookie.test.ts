import { describe, it, expect } from "vitest";
import {
  defaultBitcoinCookiePaths,
  parseBitcoinCookie,
} from "./bitcoin-cookie";

describe("parseBitcoinCookie", () => {
  it("parses user:password", () => {
    expect(parseBitcoinCookie("__cookie__:abc123\n")).toEqual({
      rpcUser: "__cookie__",
      rpcPassword: "abc123",
    });
  });

  it("keeps colons inside the password", () => {
    expect(parseBitcoinCookie("u:a:b:c")).toEqual({
      rpcUser: "u",
      rpcPassword: "a:b:c",
    });
  });

  it("rejects malformed cookie", () => {
    expect(() => parseBitcoinCookie("nocolon")).toThrow(/user:password/);
    expect(() => parseBitcoinCookie(":onlypass")).toThrow(/user:password/);
  });
});

describe("defaultBitcoinCookiePaths", () => {
  it("returns at least one path", () => {
    expect(defaultBitcoinCookiePaths().length).toBeGreaterThan(0);
  });
});
