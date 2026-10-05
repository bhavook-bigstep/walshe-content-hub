import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC32 — a catalog item shows its derived lifecycle status and (when set) its validity date.
// Deterministic against the seed: "Harbour Festival" carries an expiry inside the expiring-soon
// window, so its card renders both the status badge and the expiry date.
test("catalog item shows its status and validity", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/catalog");

  // Every visible card carries a lifecycle status badge.
  const status = page.getByTestId("entry-status").first();
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Available|Expiring soon/);

  // The seeded expiring-soon item surfaces an expiry date alongside the "Expiring soon" badge.
  const expiringBadge = page.getByTestId("entry-status").filter({ hasText: "Expiring soon" }).first();
  await expect(expiringBadge).toBeVisible();
  await expect(page.getByTestId("entry-validity").first()).toContainText(/Expires/);
});
