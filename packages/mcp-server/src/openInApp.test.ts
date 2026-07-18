import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./server";
import { openInApp } from "./tools";
import { designFile } from "./testFixtures";

async function connect(server: ReturnType<typeof buildServer>): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("open_in_app gating", () => {
  it("is absent from the stdio build's tool list", async () => {
    const client = await connect(buildServer());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("open_in_app");
  });

  it("is listed and writes the openDraft line when app-spawned", async () => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });
    try {
      const client = await connect(buildServer({ openInApp: true }));
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("open_in_app");

      const res = (await client.callTool({
        name: "open_in_app",
        arguments: { designFile },
      })) as { content: { type: string; text: string }[] };
      expect(JSON.parse(res.content[0]?.text ?? "{}")).toEqual({ ok: true });

      expect(writes).toHaveLength(1);
      const parsed = JSON.parse(writes[0]?.trim() ?? "{}");
      expect(parsed.zplabEvent).toBe("openDraft");
      expect(parsed.designFile).toEqual(designFile);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("openInApp validation", () => {
  it("builds an openDraft line for a valid design file", () => {
    const result = openInApp(designFile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.line)).toEqual({ zplabEvent: "openDraft", designFile });
  });

  it("returns errors for a malformed design file", () => {
    const result = openInApp({ schemaVersion: 3, label: { widthMm: 10 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
