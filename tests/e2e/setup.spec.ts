import { expect, test } from "@playwright/test";

test("setup guidance renders without external service credentials", async ({ page }) => {
  const response = await page.goto("/setup");

  await expect(page.getByText("Setup required", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect your services" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create `.env.local`" })).toBeVisible();

  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
});

test("health endpoint fails closed when required configuration is absent", async ({ request }) => {
  const response = await request.get("/api/health");
  const body = await response.json() as {
    status: string;
    checks: { configuration: boolean; database: boolean };
  };

  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(body).toMatchObject({
    status: "unavailable",
    checks: {
      configuration: false,
      database: false
    }
  });
});
