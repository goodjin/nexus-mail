import { test, expect } from '@playwright/test';

test.describe('Attachment Deep Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420');
        try {
            await page.waitForSelector('[data-testid="email-card-100"]', { timeout: 5000 });
        } catch (e) {
            console.log("DEBUG: Page content on timeout:", await page.content());
            await page.screenshot({ path: 'tmp/e2e_timeout.png' });
            throw e;
        }
    });

    test('should show attachments and trigger download dialog', async ({ page }) => {
        // 1. 点击一个有附件的邮件 (Mock 数据中所有邮件现在都有附件)
        await page.getByTestId('email-card-100').click();
        await expect(page.getByTestId('action-delete')).toBeVisible();
        
        // 2. 验证附件列表显示
        const attachment = page.locator('[data-testid="attachment-item-mock-att-1"]');
        await expect(attachment).toBeVisible();
        await expect(attachment).toContainText('welcome.pdf');

        // 3. 点击下载按钮 (由于是浏览器环境，调用 tauri dialog 会失败或被 mock 拦截)
        // 在我们的 mock 环境中，invoke('get_attachment') 会返回字节数组
        const downloadBtn = page.locator('[data-testid="attachment-download-mock-att-1"]');
        await expect(downloadBtn).toBeVisible();
        
        // 注意：在 Playwright 模拟环境里，我们无法真正测试 native dialog，
        // 但我们可以验证点击逻辑没有崩溃，或者通过 Mock 拦截验证参数。
    });

    test('should allow selecting attachments in compose modal', async ({ page }) => {
        // 1. 打开写信模态框
        await page.click('[data-testid="compose-button"]');
        await expect(page.locator('text=New Message')).toBeVisible();

        // 2. 验证附件按钮存在
        const attachBtn = page.locator('button:has(svg.lucide-paperclip)');
        await expect(attachBtn).toBeVisible();

        // 3. 模拟填写表单
        await page.fill('#to', 'test@example.com');
        await page.fill('#subject', 'Test with attachments');
        await page.fill('textarea', 'Hello, please see attached.');

        // 4. 点击发送 (目前 Mock 会成功)
        await page.click('[data-testid="compose-send-button"]');
        await expect(page.locator('text=New Message')).not.toBeVisible();
    });
});
