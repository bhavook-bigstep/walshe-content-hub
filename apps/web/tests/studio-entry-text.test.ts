import { describe, expect, it } from "vitest";
import { entryTextFields, entryTextGroups } from "../lib/studio/entry-text";
import type { Entry } from "@walsh/shared";

// Synthetic entry fixture — only the fields the flattener reads matter; the rest are defaults.
function makeEntry(over: Partial<Entry>): Entry {
  return {
    ai_created: false,
    asset_keys: [],
    attributes: {},
    brand_safe: true,
    catalog_id: null,
    city: "",
    country: "",
    cover_object_key: "",
    created_by_email: "seed@example.test",
    custom_sections: [],
    description: "",
    destination: "",
    display_status: "approved",
    expires_at: null,
    highlights: [],
    id: 1,
    items: [],
    market_tags: [],
    org_name: "Test Org",
    provider_id: 1,
    review_reason: "",
    season: null,
    state: "",
    status: "approved",
    title: "",
    type: "event",
    valid_from: null,
    visibility: "public",
    ...over,
  } as unknown as Entry;
}

describe("entry text flattening", () => {
  it("test_flattens_factual_fields_in_order", () => {
    const e = makeEntry({
      id: 7,
      title: "Harbour Festival",
      description: "A seaside festival.",
      destination: "Galway",
      city: "Galway",
      state: "Connacht",
      country: "Ireland",
      highlights: ["Live music", "Street food"],
      custom_sections: [{ title: "Tickets", body: "From €20" }],
      items: [
        { id: 1, entry_id: 7, kind: "text", object_key: "", content_type: "", text: "Gates open at 6pm", title: "Note", alt: "", order: 0 },
      ],
      attributes: { price_from: 20, organiser: "City Council" },
    });
    const fields = entryTextFields(e);
    expect(fields[0].label).toBe("Title");
    expect(fields.find((f) => f.label === "Location")?.value).toBe("Galway, Connacht, Ireland");
    expect(fields.filter((f) => f.label === "Highlight")).toHaveLength(2);
    expect(fields.find((f) => f.label === "Section · Tickets")?.value).toBe("From €20");
    expect(fields.find((f) => f.label === "Item · Note")?.value).toBe("Gates open at 6pm");
    expect(fields.some((f) => f.value === "City Council")).toBe(true);
  });

  it("test_drops_empty_fields", () => {
    const e = makeEntry({ id: 2, title: "Bare", description: "" });
    const fields = entryTextFields(e);
    expect(fields).toEqual([{ label: "Title", value: "Bare" }]);
  });

  it("test_groups_by_entry", () => {
    const groups = entryTextGroups([makeEntry({ id: 3, title: "One", type: "event", destination: "Cork" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "entry-3", entryId: 3, title: "One", subtitle: "event · Cork" });
  });
});
