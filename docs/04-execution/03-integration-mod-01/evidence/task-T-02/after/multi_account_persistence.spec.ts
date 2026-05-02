import { test, expect } from '@playwright/test';

const openAccountsTab = async (page) => {
  await page.goto('/');
  await page.locator('button[title="Settings"]').click();
  await expect(page.getByText('Settings')).toBeVisible();
  await page.getByRole('button', { name: 'Accounts' }).click();
};

const openAddAccount = async (page) => {
  await openAccountsTab(page);
  await page.getByRole('button', { name: 'Add New Account' }).click();
};

const fillAccountForm = async (page, email: string, displayName: string, password: string) => {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('label:has-text("Display Name")').locator('..').locator('input').fill(displayName);
  await page.locator('input[placeholder="Leave blank to keep current"]').fill(password);
};

test.describe('Account Access & Switching', () => {
  test('should prevent creation when required fields are missing', async ({ page }) => {
    await openAddAccount(page);
    const createButton = page.getByRole('button', { name: 'Create Account' });
    await expect(createButton).toBeDisabled();
    await expect(page.getByText('Fill in required email and server settings to continue.')).toBeVisible();
  });

  test('should create account and show success state', async ({ page }) => {
    await openAddAccount(page);
    const newEmail = `test-${Date.now()}@test.com`;
    await fillAccountForm(page, newEmail, 'Test Account', 'password');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Saved successfully.')).toBeVisible();
    await expect(page.getByTestId(`account-item-${newEmail}`)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Settings')).toBeHidden();

    const newAccountButton = page.locator(`button[title="${newEmail}"]`);
    await expect(newAccountButton).toBeVisible();
    await newAccountButton.click();
    await expect(newAccountButton).toHaveClass(/ring-nexus-accent/);

    await page.reload();
    await page.waitForSelector('aside');
    await expect(page.locator(`button[title="${newEmail}"]`)).toBeVisible();
  });

  test('should show connection test failure feedback', async ({ page }) => {
    await openAddAccount(page);
    await fillAccountForm(page, `fail-${Date.now()}@test.com`, 'Fail Account', 'error');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText('认证失败')).toBeVisible();
  });

  test('should switch accounts from the sidebar', async ({ page }) => {
    await openAddAccount(page);
    const newEmail = `switch-${Date.now()}@test.com`;
    await fillAccountForm(page, newEmail, 'Switch Account', 'password');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByTestId(`account-item-${newEmail}`)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Settings')).toBeHidden();

    const newAccountButton = page.locator(`button[title="${newEmail}"]`);
    await expect(newAccountButton).toBeVisible();
    await newAccountButton.click();
    await expect(newAccountButton).toHaveClass(/ring-nexus-accent/);
  });
});
