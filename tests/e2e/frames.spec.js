import { test, expect } from '@playwright/test';

test.describe('Frames', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#mindmap .node', { timeout: 10000 });
  });

  test('Shift+F crée un frame', async ({ page }) => {
    // Click on SVG background to deselect
    const svg = page.locator('#mindmap');
    const box = await svg.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    await page.keyboard.press('Shift+F');
    await page.waitForTimeout(300);

    // A frame should appear
    const frame = page.locator('#mindmap .frame');
    await expect(frame).toBeVisible();
  });

  test('le menu contextuel du canvas propose "Nouveau cadre"', async ({ page }) => {
    const svg = page.locator('#mindmap');
    const box = await svg.boundingBox();
    // Right-click on empty canvas
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8, { button: 'right' });
    await page.waitForTimeout(200);

    const menuItem = page.locator('.context-menu button', { hasText: 'cadre' });
    await expect(menuItem).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
