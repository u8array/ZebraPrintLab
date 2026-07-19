import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { startHttpServer } from "./http.js";

/** First stdin line as the bearer token, keeping it off argv (readable by
 *  any same-user process). The host closes stdin right after the line. */
function readTokenFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString("utf8");
      const i = buf.indexOf("\n");
      if (i >= 0) {
        process.stdin.off("data", onData);
        process.stdin.pause();
        resolve(buf.slice(0, i).trim());
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", () => reject(new Error("stdin closed before a token line")));
    process.stdin.once("error", reject);
  });
}

// No top-level await: the SEA sidecar build bundles this entry as CJS.
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      http: { type: "boolean", default: false },
      port: { type: "string" },
      token: { type: "string" },
      "token-stdin": { type: "boolean", default: false },
    },
  });

  if (values.http) {
    const port = Number(values.port);
    if (!values.port || !Number.isInteger(port) || port < 0 || port > 65535) {
      process.stderr.write("--http requires a valid --port\n");
      process.exit(1);
    }
    const token = values["token-stdin"] ? await readTokenFromStdin() : values.token;
    if (!token) {
      process.stderr.write("--http requires --token or --token-stdin\n");
      process.exit(1);
    }
    await startHttpServer({ port, token });
  } else {
    // stdin is the JSON-RPC transport here, so --token-stdin cannot apply.
    const server = buildServer();
    await server.connect(new StdioServerTransport());
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
