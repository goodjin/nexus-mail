import { test, expect } from '@playwright/test';

test.describe('Interactions and Validations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside');
    await page.waitForSelector('[data-testid^="email-card-"]');
  });

  test('should show error message when sending empty email', async ({ page }) => {
    // 1. Open Compose
    await page.getByRole('button', { name: /Compose/i }).click();

    // 2. Click Send without filling anything
    const sendBtn = page.getByTestId('compose-send-button');
    await sendBtn.click();

    // 3. Verify Error message appears in the modal
    const errorMsg = page.getByTestId('compose-error');
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).toHaveText(/Please fill in recipient and body/);

    // 4. Input something and click send again - verify it still shows error if other field missing
    await page.locator('input[placeholder="recipient@example.com"]').fill('bob@example.com');
    await sendBtn.scrollIntoViewIfNeeded();
    await sendBtn.evaluate((node) => (node as HTMLButtonElement).click());
    await expect(errorMsg).toBeVisible();
  });

  test('should handle attachments correctly', async ({ page }) => {
    const isTauri = await page.evaluate(() => !!(window as any).__TAURI_INTERNALS__);
    test.skip(!isTauri, 'Attachment picker requires Tauri runtime');
    await page.getByRole('button', { name: /Compose/i }).click();

    // 1. Check attachment paperclip exists
    const paperclip = page.locator('button:has(svg.lucide-paperclip)');
    await expect(paperclip).toBeVisible();

    // 2. Simulate File Upload (using the hidden input)
    const fileChooserPromise = page.waitForEvent('filechooser');
    await paperclip.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is a test pdf content')
    });

    // 3. Verify attachment appears in the list
    const attachmentItem = page.locator('span:has-text("test.pdf")');
    await expect(attachmentItem).toBeVisible();

    // 4. Delete attachment
    const deleteBtn = attachmentItem.locator('xpath=..').locator('button');
    await deleteBtn.click();
    await expect(attachmentItem).not.toBeVisible();
  });

  test('should show visible selection state for emails', async ({ page }) => {
    // 1. Select the first email
    const emailCards = page.locator('[data-testid^="email-card-"]');
    await expect(emailCards.first()).toBeVisible();
    
    // 2. Click it
    await emailCards.first().click({ force: true });

    await expect(page.getByText('Select an email to read')).toBeHidden();
  });
});
