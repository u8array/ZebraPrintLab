import { describe, it, expect } from "vitest";
import { generateMcpToken, mcpConfigSnippet } from "./mcpServer";

describe("generateMcpToken", () => {
  it("returns 32 lowercase hex chars", () => {
    expect(generateMcpToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is unlikely to collide", () => {
    expect(generateMcpToken()).not.toBe(generateMcpToken());
  });
});

describe("mcpConfigSnippet", () => {
  it("embeds the loopback url and bearer token", () => {
    const snippet = mcpConfigSnippet(4123, "deadbeef");
    const parsed = JSON.parse(snippet) as {
      mcpServers: { zplab: { url: string; headers: { Authorization: string } } };
    };
    expect(parsed.mcpServers.zplab.url).toBe("http://127.0.0.1:4123/");
    expect(parsed.mcpServers.zplab.headers.Authorization).toBe("Bearer deadbeef");
  });
});
