import { expect, test } from "@playwright/test";

test("setup guidance renders without external service credentials", async ({ page }) => {
  await page.goto("/setup");

  await expect(page.getByText("Setup required", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect your services" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create `.env.local`" })).toBeVisible();
});
