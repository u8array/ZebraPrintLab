import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, SERVER_INSTRUCTIONS } from "./server";

async function connect(): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([buildServer().connect(serverT), client.connect(clientT)]);
  return client;
}

describe("server handshake", () => {
  it("delivers the workflow instructions at initialize", async () => {
    const client = await connect();
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    expect(SERVER_INSTRUCTIONS).toContain("get_schema");
  });

  it("returns tool results as compact JSON (no pretty-print whitespace)", async () => {
    const client = await connect();
    const res = (await client.callTool({
      name: "get_schema",
      arguments: {},
    })) as { content: { type: string; text: string }[] };
    const text = res.content[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\n\s+/);
  });
});
