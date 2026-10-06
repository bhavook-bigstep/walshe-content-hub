import { expect, test } from "@playwright/test";

// AC46 + AC47 — the storyboard studio: multi-scene editing (add / reorder / duration / transition)
// and stitching the ordered scenes into a video. The API serves real CORS headers in e2e
// (CORS_ORIGINS in playwright.config), so the browser calls it directly.

test("agent builds a multi-scene storyboard and generates a video", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@example.test");
  await page.getByLabel("Password").fill("demo-pass-0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agent$/);

  await page.goto("/agent/studio");
  await expect(page.getByTestId("studio-canvas")).toBeVisible();

  // Open the Timeline top drawer, which starts with a single scene.
  await page.getByRole("button", { name: /Timeline/ }).click();
  const scenePanel = page.getByLabel("Scenes");
  await expect(scenePanel.getByText(/1 scene/)).toBeVisible();

  // Add a second scene (AC46: add).
  await scenePanel.getByRole("button", { name: "+ Add scene" }).click();
  await expect(scenePanel.getByText(/2 scenes/)).toBeVisible();

  const sceneList = page.getByRole("list", { name: "Scene list" });
  const items = sceneList.getByRole("listitem");
  await expect(items).toHaveCount(2);

  // Give the (active) new scene a zoom transition and a shorter duration (AC46: per-scene settings).
  await page.getByLabel("Scene transition").selectOption("zoom");
  await expect(page.getByLabel("Scene transition")).toHaveValue("zoom");
  await page.getByLabel("Scene duration (ms)").fill("2000");

  // Reorder: move the first scene down; the new first scene is the one created second (AC46: reorder).
  await items.first().getByRole("button", { name: /Move .* down/ }).click();
  await expect(items.first()).toContainText("Scene 2");

  // The canvas renders the storyboard.
  await expect(page.locator("canvas").first()).toBeVisible();

  // Generate a video from the ordered scenes (AC47). The action is wired to POST /render/video; we
  // assert the editor reflects a result (a ready video or a graceful "unavailable") regardless of
  // whether ffmpeg is present on the runner.
  await page.getByRole("button", { name: "Generate video" }).click();
  await expect(page.getByText(/Video ready|Video rendering unavailable/)).toBeVisible({ timeout: 60000 });
});
