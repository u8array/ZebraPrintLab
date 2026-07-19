import { describe, it, expect, vi, afterEach } from "vitest";
import { respondToDesignRequest } from "./useMcpBridge";
import { useLabelStore } from "../store/labelStore";
import { setMeasuredBounds, clearMeasuredBounds } from "../components/Canvas/measuredBoundsCache";

afterEach(() => {
  vi.restoreAllMocks();
  clearMeasuredBounds("bc1");
});

describe("respondToDesignRequest", () => {
  it("POSTs the current design plus measured footprints to the sidecar", async () => {
    useLabelStore.setState({
      label: { widthMm: 100, heightMm: 50, dpmm: 8 },
      pages: [
        {
          objects: [
            {
              id: "bc1",
              type: "code128",
              x: 10,
              y: 10,
              rotation: 0,
              props: { content: "12345", height: 80 },
            } as never,
          ],
        },
      ],
      mcpServerPort: 4923,
      mcpServerToken: "tok",
    });
    setMeasuredBounds("bc1", { width: 321, height: 88 });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await respondToDesignRequest(7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:4923/design-response");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(String(init.body)) as {
      id: number;
      designFile: { label: { widthMm: number } };
      measured: Record<string, { width: number; height: number }>;
    };
    expect(body.id).toBe(7);
    expect(body.designFile.label.widthMm).toBe(100);
    expect(body.measured.bc1).toEqual({ width: 321, height: 88 });
  });
});
