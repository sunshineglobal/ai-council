import { expect, test } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "AI Council" })).toBeVisible();
  await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
});
