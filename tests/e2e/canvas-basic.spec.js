import { test, expect } from '@playwright/test';

test.describe('Canvas de base', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#mindmap .node', { timeout: 10000 });
  });

  test('le root node est visible', async ({ page }) => {
    const root = page.locator('#mindmap .node').first();
    await expect(root).toBeVisible();
  });

  test('ajouter un enfant avec Tab', async ({ page }) => {
    // Click on root to select it
    await page.locator('#mindmap .node').first().click();
    const before = await page.locator('#mindmap .node').count();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const after = await page.locator('#mindmap .node').count();
    expect(after).toBeGreaterThan(before);
  });

  test('Ctrl+F fit to screen ne crash pas', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(200);
    await expect(page.locator('#mindmap .node').first()).toBeVisible();
  });

  test('zoom avec molette ne crash pas', async ({ page }) => {
    const svg = page.locator('#mindmap');
    await svg.hover();
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
    await expect(svg).toBeVisible();
  });
});
