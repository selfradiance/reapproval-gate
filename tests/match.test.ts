import { describe, expect, it } from "vitest";
import { matchAllowedResource, normalizeIntentResource, resourceMatchesPrefix } from "../src/match.js";

describe("resource matching", () => {
  it("exact match works", () => {
    expect(resourceMatchesPrefix("README.md", "README.md")).toBe(true);
    expect(resourceMatchesPrefix("README.md", "README.md/**")).toBe(false);
  });

  it("src/** matches nested paths", () => {
    expect(resourceMatchesPrefix("src/", "src/**")).toBe(true);
    expect(resourceMatchesPrefix("src/index.ts", "src/**")).toBe(true);
    expect(resourceMatchesPrefix("src/a/b.ts", "src/**")).toBe(true);
  });

  it("src/** does not match src2/file.ts", () => {
    expect(resourceMatchesPrefix("src2/file.ts", "src/**")).toBe(false);
  });

  it("rejects traversal attempts", () => {
    expect(normalizeIntentResource("../secret.txt").valid).toBe(false);
    expect(matchAllowedResource("src/../secret.txt", ["src/**"]).matched).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(normalizeIntentResource("/tmp/secret.txt").valid).toBe(false);
    expect(normalizeIntentResource("C:\\tmp\\secret.txt").valid).toBe(false);
    expect(normalizeIntentResource("\\tmp\\secret.txt").valid).toBe(false);
    expect(normalizeIntentResource("\\\\server\\share\\secret.txt").valid).toBe(false);
  });

  it("rejects empty resources", () => {
    expect(normalizeIntentResource("").valid).toBe(false);
    expect(normalizeIntentResource("   ").valid).toBe(false);
  });

  it("handles README.md exact match", () => {
    expect(matchAllowedResource("README.md", ["README.md"]).matched).toBe(true);
    expect(matchAllowedResource("docs/README.md", ["README.md"]).matched).toBe(false);
  });
});
