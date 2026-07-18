import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { startHttpServer } from "./http.js";

const { values } = parseArgs({
  options: {
    http: { type: "boolean", default: false },
    port: { type: "string" },
    token: { type: "string" },
  },
});

if (values.http) {
  const port = Number(values.port);
  if (!values.port || !Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write("--http requires a valid --port\n");
    process.exit(1);
  }
  if (!values.token) {
    process.stderr.write("--http requires --token\n");
    process.exit(1);
  }
  await startHttpServer({ port, token: values.token });
} else {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
