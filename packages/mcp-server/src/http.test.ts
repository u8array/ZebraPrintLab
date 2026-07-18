import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startHttpServer, type RunningHttpServer } from "./http";
import { designFile } from "./testFixtures";

const TOKEN = "s3cret-token";

const MCP_ACCEPT = "application/json, text/event-stream";

const initBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0.0.0" },
  },
};

let server: RunningHttpServer;

function post(
  body: unknown,
  opts: { token?: string; origin?: string; auth?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: MCP_ACCEPT,
  };
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  else if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`;
  if (opts.origin !== undefined) headers.origin = opts.origin;
  return fetch(`http://127.0.0.1:${server.port}/`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  server = await startHttpServer({ port: 0, token: TOKEN });
});

afterEach(async () => {
  await server.close();
});

describe("mcp-server http transport", () => {
  it("completes the initialize handshake with the correct token", async () => {
    const res = await post(initBody, { token: TOKEN });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { serverInfo?: unknown } };
    expect(json.result).toBeDefined();
    expect(json.result?.serverInfo).toBeDefined();
  });

  it("rejects a wrong token with 401 and no MCP processing", async () => {
    const res = await post(initBody, { token: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    const json = (await res.json()) as { result?: unknown; jsonrpc?: unknown };
    expect(json.result).toBeUndefined();
    expect(json.jsonrpc).toBeUndefined();
  });

  it("rejects a missing token with 401", async () => {
    const res = await post(initBody);
    expect(res.status).toBe(401);
  });

  it("accepts a lowercase 'bearer' scheme", async () => {
    const res = await post(initBody, { auth: `bearer ${TOKEN}` });
    expect(res.status).toBe(200);
  });

  it("accepts multiple spaces after the scheme", async () => {
    const res = await post(initBody, { auth: `Bearer   ${TOKEN}` });
    expect(res.status).toBe(200);
  });

  it("rejects a non-localhost Origin with 403 even with a valid token", async () => {
    const res = await post(initBody, { token: TOKEN, origin: "http://evil.example" });
    expect(res.status).toBe(403);
  });

  it("round-trips tools/call export_zpl over HTTP and returns ZPL", async () => {
    const res = await post(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "export_zpl", arguments: { designFile } },
      },
      { token: TOKEN },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { content?: { type: string; text: string }[] };
    };
    const text = json.result?.content?.[0]?.text ?? "";
    expect(text).toContain("^XA");
    expect(text).toContain("HELLO");
  });
});
