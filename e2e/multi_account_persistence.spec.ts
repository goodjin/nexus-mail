import { test, expect } from '@playwright/test';

const openAccountsTab = async (page) => {
  await page.goto('/');
  await page.locator('button[title="Settings"]').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
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
  test('should prevent creation when password is missing', async ({ page }) => {
    await openAddAccount(page);
    const email = `nopass-${Date.now()}@test.com`;
    await page.locator('input[type="email"]').fill(email);
    await page.locator('label:has-text("Display Name")').locator('..').locator('input').fill('No Pass');
    const createButton = page.getByRole('button', { name: 'Create Account' });
    await expect(createButton).toBeDisabled();
    await expect(page.getByText('Fill in required email and server settings to continue.')).toBeVisible();
    await expect(page.locator(`[data-testid="account-item-${email}"]`)).toHaveCount(0);
  });

  test('should create account and show success state', async ({ page }) => {
    await openAddAccount(page);
    const newEmail = `test-${Date.now()}@test.com`;
    await fillAccountForm(page, newEmail, 'Test Account', 'password');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Saved successfully.')).toBeVisible();
    await expect(page.getByTestId(`account-item-${newEmail}`)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();

    const newAccountButton = page.locator(`button[title="${newEmail}"]`);
    await expect(newAccountButton).toBeVisible();
    await newAccountButton.click();
    await expect(newAccountButton).toHaveClass(/ring-nexus-accent/);

    await page.reload();
    await page.waitForSelector('aside');
    await expect(page.locator(`button[title="${newEmail}"]`)).toBeVisible();
  });

  test('should show IMAP auth failure feedback', async ({ page }) => {
    await openAddAccount(page);
    const email = `fail-${Date.now()}@test.com`;
    await fillAccountForm(page, email, 'Fail Account', 'error');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText('认证失败')).toBeVisible();
    await expect(page.locator(`[data-testid="account-item-${email}"]`)).toHaveCount(0);
  });

  test('should show SMTP connection failure feedback', async ({ page }) => {
    await openAddAccount(page);
    const email = `smtp-fail-${Date.now()}@test.com`;
    await fillAccountForm(page, email, 'SMTP Fail', 'password');
    await page.locator('label:has-text("SMTP Host")').locator('..').locator('input').fill('smtp-fail.test');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText('连接失败')).toBeVisible();
    await expect(page.locator(`[data-testid="account-item-${email}"]`)).toHaveCount(0);
  });

  test('should switch accounts from the sidebar', async ({ page }) => {
    await openAddAccount(page);
    const newEmail = `switch-${Date.now()}@test.com`;
    await fillAccountForm(page, newEmail, 'Switch Account', 'password');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByTestId(`account-item-${newEmail}`)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();

    const inboxBadge = page.getByTestId('badge-inbox');
    await expect(inboxBadge).toHaveText('95');
    await page.getByTestId('folder-sent').click();
    await expect(page.locator('h2')).toContainText('Sent');

    const newAccountButton = page.locator(`button[title="${newEmail}"]`);
    await expect(newAccountButton).toBeVisible();
    await newAccountButton.click();
    await expect(newAccountButton).toHaveClass(/ring-nexus-accent/);
    await expect(inboxBadge).toHaveText('12');
    await expect(page.locator('h2')).toContainText('Inbox');

    const demoAccountButton = page.locator('button[title="demo@nexus-mail.com"]');
    await demoAccountButton.click();
    await expect(demoAccountButton).toHaveClass(/ring-nexus-accent/);
    await expect(inboxBadge).toHaveText('95');
  });
});
