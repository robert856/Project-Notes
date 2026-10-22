import { describe, it, expect } from "vitest";
import { safeUrl, matches } from "./model";
describe("untrusted card URLs", () => {
  it("rejects executable and local protocols", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///etc/passwd",
      "not a url",
    ])
      expect(safeUrl(url)).toBeNull();
  });
  it("accepts web destinations", () =>
    expect(safeUrl("https://example.com")).toBe("https://example.com/"));
});
it("searches title and content case insensitively", () => {
  expect(matches("Midnight", "A forest walk", "FOREST")).toBe(true);
  expect(matches("Midnight", "A forest walk", "ocean")).toBe(false);
});
