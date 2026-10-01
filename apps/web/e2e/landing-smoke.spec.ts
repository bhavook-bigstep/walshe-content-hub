import { expect, test } from "@playwright/test";

// AC20 — the public landing page renders a branded hero + a sign-in CTA (no auth needed).
test("landing hero and cta", async ({ page }) => {
  await page.goto("/");
  // Branded hero headline (Walshe design overhaul).
  await expect(page.getByRole("heading", { name: /verified destinations/i })).toBeVisible();
  // A clear CTA into sign-in exists.
  await expect(page.getByRole("link", { name: /^sign in$/i }).first()).toBeVisible();
  // The Walshe Group wordmark (logo image) is present.
  await expect(page.getByRole("img", { name: /walshe/i }).first()).toBeVisible();
});
