import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createDraft,
  createDraftShape,
  designFileEnvelopeSchema,
  exportZpl,
  getSchema,
  importZpl,
  openInApp,
  validateDraft,
  validateZpl,
  zplInputShape,
} from "./tools.js";

export interface BuildServerOptions {
  /** Registers open_in_app, whose handler prints an event line to stdout. Set
   *  only in HTTP mode, where stdout is free (in stdio mode it is JSON-RPC). */
  openInApp?: boolean;
}

// Compact on purpose: pretty-printing inflates every tool result by ~45%
// whitespace tokens the model does not need.
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

/** Workflow recipe the host injects into the agent's context at initialize,
 *  so every session starts pre-trained instead of discovering it by trial. */
export const SERVER_INSTRUCTIONS =
  "ZPLab builds Zebra ZPL label designs. Call get_schema first to learn the " +
  "object types and their props. Build a label with create_draft (x/y in dots " +
  "from the top-left origin; props merge over defaults), then read the returned " +
  "warnings, bounds, and overlaps and iterate until nothing unintended remains. " +
  "bounds/overlaps marked approx are headless estimates (barcodes and single-line " +
  "text): keep extra " +
  "clearance around them. Overlaps are neutral facts, not errors: a frame or " +
  "reverse box overlaps its contents by design. Bring existing ZPL through " +
  "import_zpl (editable design file) or validate_zpl (lint only); both split " +
  "multi-label streams into one page per ^XA block. export_zpl returns the " +
  "final ZPL; open_in_app (when present) replaces the design in the running " +
  "ZPLab editor, so confirm with the user before calling it.";

/** Single tool definition shared by the stdio and HTTP entry points. */
export function buildServer(options: BuildServerOptions = {}): McpServer {
  // Display identity the MCP client shows; matches the config-snippet key.
  const server = new McpServer(
    { name: "zplab", version: "0.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create ZPLab draft",
      description:
        "Build a ZPLab label draft from a size and a list of objects. Returns the " +
        "parseable design file, preflight warnings, per-object bounds (dots), and " +
        "bbox overlaps. Call get_schema for object types.",
      inputSchema: createDraftShape,
    },
    async (args) => json(createDraft(args)),
  );

  server.registerTool(
    "validate_draft",
    {
      title: "Validate ZPLab draft",
      description:
        "Parse a design file and return schema errors, preflight warnings, per-object " +
        "bounds (dots), and bbox overlaps.",
      inputSchema: designFileEnvelopeSchema.shape,
    },
    async ({ designFile }) => json(validateDraft(designFile)),
  );

  server.registerTool(
    "export_zpl",
    {
      title: "Export ZPL",
      description: "Parse a design file and return its generated ZPL.",
      inputSchema: designFileEnvelopeSchema.shape,
    },
    async ({ designFile }) => json(exportZpl(designFile)),
  );

  server.registerTool(
    "validate_zpl",
    {
      title: "Validate raw ZPL",
      description:
        "Parse a raw ZPL stream (one page per ^XA block) and report it: object/page " +
        "count, detected label, parser findings (unknown/partial/hardware-bound " +
        "commands), preflight warnings, per-object bounds (dots), and bbox overlaps. " +
        "widthMm/heightMm are fallbacks for streams without ^PW/^LL.",
      inputSchema: zplInputShape,
    },
    async ({ zpl, dpmm, widthMm, heightMm }) => json(validateZpl(zpl, dpmm, widthMm, heightMm)),
  );

  server.registerTool(
    "import_zpl",
    {
      title: "Import raw ZPL",
      description:
        "Parse a raw ZPL stream into an editable design file (one page per ^XA block; " +
        "feed it to export_zpl or open_in_app) plus parser findings, per-object bounds " +
        "(dots), and bbox overlaps. Size falls back to the caller's hints then 100x50mm.",
      inputSchema: zplInputShape,
    },
    async ({ zpl, dpmm, widthMm, heightMm }) => json(importZpl(zpl, dpmm, widthMm, heightMm)),
  );

  server.registerTool(
    "get_schema",
    {
      title: "Get object schema",
      description: "List supported object types and their props for building a draft.",
      inputSchema: {},
    },
    async () => json(getSchema()),
  );

  // Only when ZPLab spawned the server (HTTP mode): the handler prints the
  // draft to stdout, which the app pipes and forwards to its editor.
  if (options.openInApp) {
    server.registerTool(
      "open_in_app",
      {
        title: "Open draft in ZPLab",
        description:
          "Push a design file into the running ZPLab desktop app, replacing the current " +
          "design. Only available when ZPLab launched this server.",
        inputSchema: designFileEnvelopeSchema.shape,
      },
      async ({ designFile }) => {
        const result = openInApp(designFile);
        if (!result.ok) return json(result);
        process.stdout.write(result.line + "\n");
        return json({ ok: true });
      },
    );
  }

  return server;
}
