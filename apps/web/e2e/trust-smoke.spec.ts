import { expect, test, type Page } from "@playwright/test";
import { allowApiCors } from "./_helpers";

// AC34–AC37 — trust, approval & audit.

const PASSWORD = "demo-pass-0000";

// Log in (clearing any prior session first) and wait for the role landing route.
async function loginAs(page: Page, email: string, landing: RegExp): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    /* storage may be unavailable before first paint */
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(landing);
}

// AC34 — the pre-send check catches an unsendable composition before anything goes out.
test("agent sees a preflight issue before sending", async ({ page }) => {
  await allowApiCors(page);
  await loginAs(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/social");
  // The seeded "Trade Showcase teaser" holds an expired item, so the check must fail.
  await page.getByLabel("Composition").selectOption({ label: "Trade Showcase teaser" });
  await page.getByRole("button", { name: /run pre-send check/i }).click();

  const issues = page.getByTestId("preflight-issues");
  await expect(issues).toBeVisible();
  await expect(issues).toContainText(/no longer available/i);
});

// AC35 — a reviewer returns an entry to its owner with a reason, which then shows on the entry.
test("provider sends an entry back with a reason", async ({ page }) => {
  await allowApiCors(page);
  await loginAs(page, "provider@example.test", /\/provider$/);

  // Create an entry, then open its management page.
  await page.goto("/provider/catalog/new");
  await page.getByLabel("Title").fill(`Review me ${Date.now()}`);
  await page.getByLabel("Destination").fill("Donegal");
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.getByRole("link", { name: /set brand-safe flag and access/i }).click();

  const reason = "Add captions to the hero image before approval.";
  await page.getByLabel("Reason to send back").fill(reason);
  await page.getByRole("button", { name: /send back for changes/i }).click();

  const banner = page.getByTestId("review-reason");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(reason);
});

// AC36 — an off-limits term removes a matching item from the agent's catalog everywhere.
test("off-limits term removes an item from the agent catalog", async ({ page }) => {
  await allowApiCors(page);

  // A board flags "Galway" off-limits (matches the seeded "Harbour Festival").
  await loginAs(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/blocklist");
  await page.getByLabel("Off-limits term").fill("Galway");
  await page.getByRole("button", { name: /add term/i }).click();
  await expect(page.getByTestId("blocklist")).toContainText("galway");

  try {
    // The agent no longer sees that item, but the rest of the catalog still loads.
    await loginAs(page, "agent@example.test", /\/agent$/);
    await page.goto("/agent/catalog");
    await expect(page.getByText("Cliffs of Moher").first()).toBeVisible();
    await expect(page.getByText("Harbour Festival")).toHaveCount(0);
  } finally {
    // Always clean up, even if an assertion failed, so other specs see the full seeded catalog.
    await loginAs(page, "provider@example.test", /\/provider$/);
    await page.goto("/provider/blocklist");
    await page.getByRole("button", { name: /remove galway/i }).click();
    // Removing the last term swaps the list for the empty state, so assert the term's row is gone.
    await expect(page.getByRole("button", { name: /remove galway/i })).toHaveCount(0);
  }
});

// AC37 — the admin audit view lists traceable actions.
test("admin views the audit log", async ({ page }) => {
  await allowApiCors(page);

  // Generate a traceable action (a harmless off-limits term that matches nothing).
  await loginAs(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/blocklist");
  const temp = `zzz-temp-${Date.now()}`;
  await page.getByLabel("Off-limits term").fill(temp);
  await page.getByRole("button", { name: /add term/i }).click();
  await expect(page.getByTestId("blocklist")).toContainText(temp);

  await loginAs(page, "admin@example.test", /\/admin$/);
  await page.goto("/admin/audit");
  await expect(page.getByTestId("audit-table")).toBeVisible();
  await expect(page.getByTestId("audit-table")).toContainText(/off-limits added/i);
});
