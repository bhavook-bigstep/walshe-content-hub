import { expect, test, type Page } from "@playwright/test";

const API = "http://localhost:8765";
const CORS = {
  "access-control-allow-origin": "http://localhost:3100",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};

// See studio-smoke.spec.ts: the API has no CORS middleware, so bridge the cross-port calls.
async function allowApiCors(page: Page): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), ...CORS } });
  });
}

test("agent is redirected away from admin", async ({ page }) => {
  await allowApiCors(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@example.test");
  await page.getByLabel("Password").fill("demo-pass-0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agent$/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.getByRole("heading", { name: "Agent home" })).toBeVisible();
});

// A syntactically valid JWT carrying only the fields the client reads.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

test("an expired session is bounced to login before the workspace renders", async ({ page }) => {
  await allowApiCors(page);
  // Simulate a stale session: an expired token in storage plus a lingering role cookie (the exact
  // case where the old guard let the user in and only then failed with "invalid token").
  const expired = fakeJwt({ sub: 3, role: "tourism_agent", exp: Math.floor(Date.now() / 1000) - 60 });
  await page.goto("/login");
  await page.evaluate((tok) => {
    localStorage.setItem("walsh.token", tok);
    localStorage.setItem("walsh.role", "tourism_agent");
  }, expired);
  await page.context().addCookies([
    { name: "walsh_role", value: "tourism_agent", domain: "localhost", path: "/" },
  ]);

  await page.goto("/agent");
  // The client guard clears the dead session and sends the user to sign in — no workspace, no error.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
