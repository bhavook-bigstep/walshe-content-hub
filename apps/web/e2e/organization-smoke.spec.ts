import { expect, test } from "@playwright/test";
import { login } from "./_helpers";

// AC27/AC54/AC58 — the Organization page now hosts the org profile (with a logo upload), the Team,
// and the Invite-agents controls (both moved off the sidebar / catalog).
test("organization page hosts profile, invite-agents and team", async ({ page }) => {
  await login(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/organization");

  // Profile with a logo upload (not a URL field) and the two moved sections are present.
  await expect(page.getByRole("form", { name: "Organization profile" })).toBeVisible();
  await expect(page.getByLabel("Upload organization logo")).toBeVisible();
  await expect(page.getByRole("region", { name: "Invited agents" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Team" })).toBeVisible();

  // Invite an agent by email from the org page.
  const invite = page.getByRole("region", { name: "Invited agents" });
  await invite.getByLabel("Agent email").fill("agent@example.test");
  await invite.getByRole("button", { name: "Invite" }).click();
  await expect(invite.getByText("agent@example.test")).toBeVisible();
});
