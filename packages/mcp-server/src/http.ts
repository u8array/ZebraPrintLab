import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { resolveDesignResponse } from "./appBridge.js";
import { buildServer } from "./server.js";

const HOST = "127.0.0.1";

/** Body cap for every route: a real design file with graphics is a few MB,
 *  beyond that is only an authed local DoS vector. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Read the whole body, capped. Resolves null after answering 413 and
 *  destroying the socket (the caller must bail out then). */
function readBodyCapped(req: IncomingMessage, res: ServerResponse): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!res.headersSent) res.writeHead(413);
        res.end();
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

export interface HttpServerOptions {
  port: number;
  token: string;
}

export interface RunningHttpServer {
  port: number;
  close: () => Promise<void>;
}

/** Constant-time Bearer check. Hashing both sides to a fixed 32 bytes avoids
 *  the length leak and the length-mismatch throw of a raw timingSafeEqual.
 *  Scheme is parsed per RFC 7235: case-insensitive, one-or-more spaces. */
function hasValidToken(req: IncomingMessage, expected: string): boolean {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !/^Bearer\s+/i.test(header)) return false;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const provided = createHash("sha256").update(token).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(provided, wanted);
}

/** The app's reply to a designRequest event. Bypasses the SDK transport (it is
 *  not MCP JSON-RPC), so it re-checks the Host header for loopback itself; the
 *  bearer token was already verified by the shared gate. */
async function handleDesignResponse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (req.method !== "POST" || (host !== "127.0.0.1" && host !== "localhost")) {
    res.writeHead(403).end();
    return;
  }
  const body = await readBodyCapped(req, res);
  if (body === null) return;
  let delivered = false;
  try {
    delivered = resolveDesignResponse(JSON.parse(body.toString("utf8")));
  } catch {
    // Malformed JSON falls through to the 400 below.
  }
  if (!res.writableEnded) res.writeHead(delivered ? 204 : 400).end();
}

/** Loopback-only Streamable HTTP server with mandatory bearer auth. A fresh
 *  McpServer + transport is built per request (stateless: our tools are pure
 *  request/response); Origin/Host are checked by the SDK's DNS-rebinding protection. */
export async function startHttpServer(options: HttpServerOptions): Promise<RunningHttpServer> {
  const { port, token } = options;

  const httpServer = createServer((req, res) => {
    if (!hasValidToken(req, token)) {
      res.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": "Bearer",
      });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (req.url === "/design-response") {
      // An unhandled rejection would kill the process (same guard as below).
      handleDesignResponse(req, res).catch(() => {
        if (!res.headersSent && res.writable) res.writeHead(500);
        res.end();
      });
      return;
    }

    const boundPort = (httpServer.address() as { port: number }).port;
    const authority = `${HOST}:${boundPort}`;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [authority, `localhost:${boundPort}`],
      allowedOrigins: [`http://${authority}`, `http://localhost:${boundPort}`],
    });
    const server = buildServer({ hosted: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    // Body read here (capped), then passed as parsedBody: a passive cap
    // listener would start flowing before the transport reads, losing chunks.
    void (async () => {
      const body = await readBodyCapped(req, res);
      if (body === null) return;
      let parsedBody: unknown;
      if (body.length > 0) {
        try {
          parsedBody = JSON.parse(body.toString("utf8"));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON body" }));
          return;
        }
      }
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    })().catch(() => {
      // Guard against a handler that already responded or closed the socket.
      if (!res.headersSent && res.writable) res.writeHead(500);
      res.end();
    });
  });

  const boundPort = await new Promise<number>((resolve, reject) => {
    const onListenError = (err: Error) => reject(err);
    httpServer.once("error", onListenError);
    httpServer.listen(port, HOST, () => {
      httpServer.removeListener("error", onListenError);
      const addr = httpServer.address();
      if (addr && typeof addr === "object") {
        // Readiness signal for the Tauri parent, which waits on this line before
        // reporting the server up. stdout is free in HTTP mode (not JSON-RPC).
        process.stdout.write(JSON.stringify({ zplabEvent: "listening", port: addr.port }) + "\n");
        resolve(addr.port);
      } else {
        reject(new Error("failed to determine bound port"));
      }
    });
  });

  // Post-bind errors (client resets, EPIPE) would otherwise go unhandled and
  // crash the process; surface them to stderr instead.
  httpServer.on("error", (err) => {
    console.error("mcp http server error:", err);
  });

  return {
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
