import { test, expect, chromium, type Page } from '@playwright/test';

const ready = async (page: Page) => {
  await page.goto('./');
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor')).toBeVisible();
};
test('editing continues after successive dialogs', async ({ page }) => {
  await ready(page);
  await code(page);
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editCode(page, '# Still writing after dialogs\n');
  await expect(page.locator('.view-lines')).toContainText('Still writing after dialogs');
});
async function code(page: Page) {
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await page.getByRole('button', { name: 'Open hello.py', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('#editor-loading')).toBeHidden();
}
async function editCode(page: Page, text: string, atEnd = false) {
  await page.bringToFront();
  await page.locator('.monaco-editor .view-lines').click({ position: { x: 20, y: 10 } });
  await page.keyboard.press(atEnd ? 'Control+End' : 'Control+Home');
  await page.keyboard.type(text);
}
async function exportedText(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export document', exact: true }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

test('both real editors work and retain edits across modes and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.locator('.bn-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' A lasting thought.');
  await expect(page.locator('#selection-status')).toContainText('words');
  await expect(page.locator('#save-state')).toHaveText('All changes saved');
  await code(page);
  await editCode(page, '# Persistent code\n');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-state')).toHaveText('All changes saved');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await page.getByRole('button', { name: 'Open Welcome to your space.discribe', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor')).toContainText('A lasting thought.');
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor')).toContainText('A lasting thought.');
  await code(page);
  await expect(page.locator('.view-lines')).toContainText('Persistent code');
  expect(errors).toEqual([]);
});

test('import, rename, duplicate, export, and Markdown conversion preserve source', async ({ page }) => {
  await ready(page);
  await page.locator('#file-input').setInputFiles({
    name: 'original.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# A source\n\nHello **world**\n\n<!-- preserve -->'),
  });
  await expect(page.locator('#breadcrumb-name')).toHaveText('original.md');
  await expect(page.locator('.view-lines')).toContainText('preserve');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('button', { name: 'Create a rich-text copy…', exact: true }).click();
  await page.getByRole('button', { name: 'Create copy', exact: true }).click();
  await expect(page.locator('.bn-editor:visible')).toContainText('Hello world');
  await page.getByRole('button', { name: 'Open original.md', exact: true }).click();
  await expect(page.locator('.view-lines:visible')).toContainText('preserve');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('#breadcrumb-name')).toHaveText('original copy.md');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export document', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('original copy.md');
});

test('settings persist; mobile writing and reduced motion remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Reduce motion', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Autosave', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Autosave', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Reduce motion', exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('offline reload supports both lazily loaded editors', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
      );
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30000 })
    .toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.bn-editor')).toBeVisible();
  await code(page);
  await editCode(page, '# Written offline\n');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-state')).toHaveText('All changes saved');
});

test('two clients converge, viewer is read-only, and reconnect keeps edits', async ({ page, browser }) => {
  await ready(page);
  await code(page);
  const original = await exportedText(page);
  await page.getByRole('button', { name: '↗ Collaborate', exact: true }).click();
  await page.getByRole('button', { name: '↗ Share this document', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'editor invitation' })).toBeVisible();
  const editorLink = await page.getByRole('textbox', { name: 'editor invitation' }).inputValue();
  const viewerLink = await page.getByRole('textbox', { name: 'viewer invitation' }).inputValue();
  await page.locator('#app-dialog .dialog-header button').click();
  const otherBrowser = await chromium.launch();
  const otherContext = await otherBrowser.newContext();
  const other = await otherContext.newPage();
  await other.goto(editorLink);
  await expect(other.locator('#connection-state')).toContainText('Connected');
  await expect(other.locator('.view-lines')).toContainText('dataclass');
  await Promise.all([editCode(page, '# From Alice\n'), editCode(other, '# From Bob\n', true)]);
  for (const client of [page, other]) {
    await expect(client.locator('.view-lines')).toContainText('From Alice');
    await expect(client.locator('.view-lines')).toContainText('From Bob');
  }
  const expected = '# From Alice\n' + original + '# From Bob\n';
  expect(await exportedText(page)).toBe(expected);
  expect(await exportedText(other)).toBe(expected);
  await otherContext.setOffline(true);
  await editCode(other, '# Disconnected edit\n');
  await otherContext.setOffline(false);
  await expect(page.locator('.view-lines')).toContainText('Disconnected edit', { timeout: 30000 });
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(viewerLink);
  await expect(viewer.locator('#connection-state')).toContainText('viewer');
  await expect(viewer.locator('.view-lines')).toContainText('Disconnected edit');
  await editCode(viewer, 'SHOULD NOT APPEAR');
  await expect(page.locator('.view-lines')).not.toContainText('SHOULD NOT APPEAR');
  await otherContext.close();
  await otherBrowser.close();
  await viewerContext.close();
});

test.describe('touch browser', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('both engines accept input after touch navigation', async ({ page }) => {
    await ready(page);
    await page.locator('.bn-editor').tap({ position: { x: 50, y: 20 } });
    await page.keyboard.insertText('A thought on the go. ');
    await expect(page.locator('.bn-editor')).toContainText('A thought on the go.');
    await page.getByRole('button', { name: '⌘ Code', exact: true }).tap();
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).tap();
    await page.getByRole('button', { name: 'Open hello.py', exact: true }).tap();
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).tap();
    await expect(page.locator('#editor-loading')).toBeHidden();
    await page.locator('.monaco-editor textarea').focus();
    await page.keyboard.type('# Mobile code');
    await expect(page.locator('.view-lines')).toContainText('Mobile code');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
});

test('BlockNote shares structured content, retains the host document, and ends cleanly', async ({
  page,
  browser,
}) => {
  await ready(page);
  await page.getByRole('button', { name: '↗ Collaborate', exact: true }).click();
  await page.getByRole('button', { name: '↗ Share this document', exact: true }).click();
  const invitation = page.getByRole('textbox', { name: 'editor invitation' });
  await expect(invitation).toBeVisible();
  const link = await invitation.inputValue();
  await page.locator('#app-dialog .dialog-header button').click();
  await expect(page.locator('.bn-editor:visible')).toContainText('Good things begin');
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('#connection-state')).toContainText('Connected');
  await expect(other.locator('.bn-editor:visible')).toContainText('Good things begin');
  await other.locator('.bn-editor:visible').click();
  await other.keyboard.press('Control+End');
  await other.keyboard.type(' A shared paragraph.');
  await expect(page.locator('.bn-editor:visible')).toContainText('A shared paragraph.');
  await page.getByRole('button', { name: '↗ Collaborate', exact: true }).click();
  await page.getByRole('button', { name: 'End session for everyone' }).click();
  await expect(page.locator('#connection-state')).toHaveText('Local workspace');
  await expect(page.locator('.bn-editor:visible')).toContainText('A shared paragraph.');
  await expect(other.locator('#connection-state')).toContainText('Disconnected');
  await context.close();
});

test('unsaved close can be canceled and discarded edits do not overwrite saved content', async ({ page }) => {
  await ready(page);
  await code(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Autosave', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await editCode(page, '# unsaved experiment\n');
  await page.getByRole('button', { name: 'Close hello.py', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.view-lines')).toContainText('unsaved experiment');
  await page.getByRole('button', { name: 'Close hello.py', exact: true }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Open hello.py', exact: true }).click();
  await expect(page.locator('.view-lines')).not.toContainText('unsaved experiment');
  await expect(page.locator('.view-lines')).toContainText('dataclass');
});

test('appearance toggle keeps the current file, source, editor, tabs, and undo history', async ({ page }) => {
  await ready(page);
  await code(page);
  const original = await exportedText(page);
  const tabCount = await page.getByRole('tab').count();
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('#breadcrumb-name')).toHaveText('hello.py');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('#language-select')).toBeVisible();
  expect(await page.getByRole('tab').count()).toBe(tabCount);
  expect(await exportedText(page)).toBe(original);
  await editCode(page, 'prefix');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  expect(await exportedText(page)).toBe('prefix' + original);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedText(page)).toBe(original);
  await page.getByRole('button', { name: 'Open Welcome to your space.discribe', exact: true }).click();
  await expect(page.locator('.bn-editor:visible')).toContainText('Good things begin');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'code');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('.bn-editor:visible')).toContainText('Good things begin');
  await expect(page.locator('#breadcrumb-name')).toHaveText('Welcome to your space');
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'write');
  await expect(page.locator('.bn-editor:visible')).toContainText('Good things begin');
});

test('separate Code and Write style choices persist and theme both editors', async ({ page }) => {
  await ready(page);
  expect(await page.locator('body').evaluate((el) => el.style.getPropertyValue('--paper'))).toBe('#d1dbe6');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Code mode style', exact: true }).selectOption('Midnight');
  await page.getByRole('combobox', { name: 'Write mode style', exact: true }).selectOption('Sage');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  expect(await page.locator('body').evaluate((el) => el.style.getPropertyValue('--paper'))).toBe('#d5e1da');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  expect(await page.locator('body').evaluate((el) => el.style.getPropertyValue('--bg'))).toBe('#101721');
  await expect(page.locator('.bn-editor')).toBeVisible();
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'code');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Code mode style', exact: true })).toHaveValue('Midnight');
  await expect(page.getByRole('combobox', { name: 'Write mode style', exact: true })).toHaveValue('Sage');
  await page.locator('#app-dialog .dialog-header button').click();
  await page.getByRole('button', { name: 'Open hello.py', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect
    .poll(() => page.locator('.monaco-editor').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(196, 210, 207)');
});
