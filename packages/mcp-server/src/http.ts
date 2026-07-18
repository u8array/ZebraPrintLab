import { createServer, type IncomingMessage } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";

const HOST = "127.0.0.1";

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

    const boundPort = (httpServer.address() as { port: number }).port;
    const authority = `${HOST}:${boundPort}`;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [authority, `localhost:${boundPort}`],
      allowedOrigins: [`http://${authority}`, `http://localhost:${boundPort}`],
    });
    const server = buildServer({ openInApp: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    server
      .connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch(() => {
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
