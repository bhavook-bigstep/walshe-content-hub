import { describe, expect, it } from "vitest";
import { POST } from "../app/api/studio-ops/apply/route";
import { GET } from "../app/api/studio-ops/spec/route";
import { POST as OBSERVE } from "../app/api/studio-ops/observe/route";
import { addCatalogImage, newDesign } from "../lib/studio/ops";

// The studio-ops Node HTTP service: apply an op sequence to a design server-side, over one validated,
// grounded entry point any host can call. Exercised by calling the route handlers directly.

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost/api/studio-ops/apply", { method: "POST", body: JSON.stringify(body) }));
}

describe("studio-ops HTTP service", () => {
  it("test_apply_endpoint_applies_grounded_ops", async () => {
    const design = newDesign("social");
    const res = await post({
      design,
      calls: [
        { op: "set-background", color: "#0e2a26" },
        { op: "write-copy", text: "Discover Galway" },
        { op: "place", item_id: 7 },
      ],
      allowedCatalogIds: ["7"],
      imageSrcById: { "7": "blob:served/7.png" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      design: { scenes: { background?: string; nodes: { type: string; catalogItemId?: string; src?: string }[] }[] };
      results: { status: string }[];
      valid: boolean;
    };
    expect(data.valid).toBe(true);
    expect(data.results.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    const scene = data.design.scenes[0];
    expect(scene.background).toBe("#0e2a26");
    expect(scene.nodes.some((n) => n.type === "text")).toBe(true);
    const img = scene.nodes.find((n) => n.type === "image");
    expect(img?.catalogItemId).toBe("7");
    expect(img?.src).toBe("blob:served/7.png"); // only the served src
  });

  it("test_apply_endpoint_enforces_grounding", async () => {
    const res = await post({
      design: newDesign("social"),
      calls: [{ op: "place", item_id: 999 }], // not in allowed set
      allowedCatalogIds: ["7"],
      imageSrcById: { "7": "blob:served/7.png" },
    });
    const data = (await res.json()) as { results: { status: string; reason?: string }[]; design: { scenes: { nodes: unknown[] }[] } };
    expect(data.results[0].status).toBe("rejected");
    expect(data.results[0].reason).toMatch(/not an approved catalog item/i);
    expect(data.design.scenes[0].nodes).toHaveLength(0);
  });

  it("test_apply_endpoint_rejects_bad_input", async () => {
    expect((await post({ calls: [] })).status).toBe(400); // missing design
    expect((await post({ design: newDesign("social") })).status).toBe(400); // missing calls
    const badJson = await POST(new Request("http://localhost/x", { method: "POST", body: "not json" }));
    expect(badJson.status).toBe(400);
  });

  it("test_spec_endpoint_lists_the_catalog", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ops: { op: string; description: string }[] };
    expect(data.ops.map((o) => o.op)).toEqual(expect.arrayContaining(["write-copy", "place", "add-shape"]));
  });

  it("test_observe_endpoint_describes_scenes_in_words", async () => {
    const design = addCatalogImage(newDesign("social"), 0, { src: "blob:x", catalogItemId: "7" }, {});
    const res = await OBSERVE(
      new Request("http://localhost/api/studio-ops/observe", {
        method: "POST",
        body: JSON.stringify({ design, labelsById: { "7": "Cliffs of Moher" } }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { scenes: { index: number; description: string }[] };
    expect(data.scenes[0].description).toContain('photo of "Cliffs of Moher"');
  });
});
