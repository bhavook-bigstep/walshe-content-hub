import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC21 — after login, every authenticated screen sits in a branded app shell: a primary nav with
// the role's sections, alongside the Walshe wordmark.
test("branded nav after login", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Design Studio" })).toBeVisible();
  // The Walshe wordmark is present in the shell (sibling of the nav, not inside it).
  await expect(page.getByText("Walshe", { exact: false }).first()).toBeVisible();
});
