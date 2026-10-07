import { expect, test } from "@playwright/test";

// AC20 — the public landing page renders a branded hero + a sign-in CTA (no auth needed).
test("landing hero and cta", async ({ page }) => {
  await page.goto("/");
  // Branded Voyago hero: the wordmark logo carries the hero.
  await expect(page.getByRole("img", { name: "Voyago" }).first()).toBeVisible();
  // A clear CTA into sign-in exists.
  await expect(page.getByRole("link", { name: /^sign in$/i }).first()).toBeVisible();
  // The parent brand (The Walshe Group) wordmark is present too.
  await expect(page.getByRole("img", { name: /walshe/i }).first()).toBeVisible();
});
