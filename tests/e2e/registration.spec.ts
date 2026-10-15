import { test, expect } from "@playwright/test";

test.describe("Registration flow", () => {
  test("a visitor can register and see the confirmation", async ({ page }) => {
    await page.goto("/");
    const uniqueEmail = `e2e-${Date.now()}@example.com`;

    await page.getByLabel("Full name").fill("Playwright User");
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page.getByRole("status").filter({ hasText: "You're in" })).toBeVisible();
  });

  test("double-clicking submit creates only one registration (idempotency)", async ({ page }) => {
    await page.goto("/");
    const uniqueEmail = `e2e-dup-${Date.now()}@example.com`;

    await page.getByLabel("Full name").fill("Double Click User");
    await page.getByLabel("Email").fill(uniqueEmail);

    const button = page.getByRole("button", { name: "Register" });
    // fire both clicks back-to-back, simulating an impatient real user
    await Promise.all([button.click(), button.click({ force: true }).catch(() => {})]);

    await expect(page.getByRole("status").filter({ hasText: /You're in|waitlist/ })).toBeVisible();

    // verify via the admin view that only one registration landed
    await page.goto("/admin");
    const matches = page.locator("li", { hasText: uniqueEmail });
    await expect(matches).toHaveCount(1);
  });
});
