/** Shared design-file fixtures for the tool and HTTP transport tests. */

export function textObject(id: string, content: string) {
  return {
    id,
    type: "text",
    x: 10,
    y: 10,
    rotation: 0,
    props: { content, fontHeight: 30, fontWidth: 0, rotation: "N" },
  };
}

/** Minimal valid single-page design file. */
export const designFile = {
  schemaVersion: 3,
  label: { widthMm: 100, heightMm: 50, dpmm: 8 },
  pages: [{ objects: [textObject("t1", "HELLO")] }],
};
