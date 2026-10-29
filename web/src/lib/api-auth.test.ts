import { describe, expect, it } from "vitest";
import { bearerAuthorization, isExpiredSessionMessage } from "./api-auth";

describe("bearerAuthorization", () => {
  it("prefixes Bearer and does not invent a token", () => {
    const headers = bearerAuthorization("access-token-value");
    expect(headers.Authorization.startsWith("Bearer ")).toBe(true);
    expect(headers.Authorization.endsWith("access-token-value")).toBe(true);
    expect(headers.Authorization.split(" ").length).toBe(2);
  });

  it("rejects an empty token", () => {
    expect(() => bearerAuthorization("  ")).toThrow(/Missing access token/);
  });
});

describe("isExpiredSessionMessage", () => {
  it("detects expiry copy used by the API", () => {
    expect(isExpiredSessionMessage("Your session has expired. Sign in again.")).toBe(true);
    expect(isExpiredSessionMessage("The session token signature is invalid.")).toBe(false);
  });
});
