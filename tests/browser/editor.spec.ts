import { test, expect, chromium, type Page } from '@playwright/test';

const ready = async (page: Page) => {
  await page.goto('./');
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor:visible')).toBeVisible();
};
test('editing continues after successive dialogs', async ({ page }) => {
  await ready(page);
  await code(page);
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editCode(page, '# Still writing after dialogs\n');
  await expect(page.locator('.view-lines:visible')).toContainText('Still writing after dialogs');
});
async function code(page: Page) {
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await page.getByRole('button', { name: 'Open hello.py', exact: true }).click();
  await expect(page.locator('.monaco-editor:visible')).toBeVisible();
  await expect(page.locator('#editor-loading')).toBeHidden();
}
async function editCode(page: Page, text: string, atEnd = false) {
  await page.bringToFront();
  await page.locator('.monaco-editor:visible .view-lines:visible').click({ position: { x: 20, y: 10 } });
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
  await page.locator('.bn-editor:visible').click();
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
  await expect(page.locator('.bn-editor:visible')).toContainText('A lasting thought.');
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor:visible')).toContainText('A lasting thought.');
  await code(page);
  await expect(page.locator('.view-lines:visible')).toContainText('Persistent code');
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
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('.view-lines:visible')).toContainText('preserve');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('button', { name: 'Create a rich-text copy…', exact: true }).click();
  await page.getByRole('button', { name: 'Create copy', exact: true }).click();
  await expect(page.locator('.bn-editor:visible')).toContainText('Hello world');
  await page.getByRole('button', { name: 'Open original.md', exact: true }).click();
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
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
  await expect(page.locator('.bn-editor:visible')).toBeVisible();
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
  await other.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(other.locator('#connection-state')).toContainText('Connected');
  await expect(other.locator('.view-lines:visible')).toContainText('dataclass');
  await Promise.all([editCode(page, '# From Alice\n'), editCode(other, '# From Bob\n', true)]);
  for (const client of [page, other]) {
    await expect(client.locator('.view-lines:visible')).toContainText('From Alice');
    await expect(client.locator('.view-lines:visible')).toContainText('From Bob');
  }
  const expected = '# From Alice\n' + original + '# From Bob\n';
  expect(await exportedText(page)).toBe(expected);
  expect(await exportedText(other)).toBe(expected);
  await otherContext.setOffline(true);
  await editCode(other, '# Disconnected edit\n');
  await otherContext.setOffline(false);
  await expect(page.locator('.view-lines:visible')).toContainText('Disconnected edit', { timeout: 30000 });
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(viewerLink);
  await viewer.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(viewer.locator('#connection-state')).toContainText('viewer');
  await expect(viewer.locator('.view-lines:visible')).toContainText('Disconnected edit');
  await editCode(viewer, 'SHOULD NOT APPEAR');
  await expect(page.locator('.view-lines:visible')).not.toContainText('SHOULD NOT APPEAR');
  await otherContext.close();
  await otherBrowser.close();
  await viewerContext.close();
});

test.describe('touch browser', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('both engines accept input after touch navigation', async ({ page }) => {
    await ready(page);
    await page.locator('.bn-editor:visible').tap({ position: { x: 50, y: 20 } });
    await page.keyboard.insertText('A thought on the go. ');
    await expect(page.locator('.bn-editor:visible')).toContainText('A thought on the go.');
    await page.getByRole('button', { name: '⌘ Code', exact: true }).tap();
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).tap();
    await page.getByRole('button', { name: 'Open hello.py', exact: true }).tap();
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).tap();
    await expect(page.locator('#editor-loading')).toBeHidden();
    await page.locator('.monaco-editor:visible textarea').focus();
    await page.keyboard.type('# Mobile code');
    await expect(page.locator('.view-lines:visible')).toContainText('Mobile code');
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
  await expect(page.locator('.view-lines:visible')).toContainText('unsaved experiment');
  await page.getByRole('button', { name: 'Close hello.py', exact: true }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Open hello.py', exact: true }).click();
  await expect(page.locator('.view-lines:visible')).not.toContainText('unsaved experiment');
  await expect(page.locator('.view-lines:visible')).toContainText('dataclass');
});

test('toggle changes engines on the same code file and keeps exact source and tabs', async ({ page }) => {
  await ready(page);
  await code(page);
  const original = await exportedText(page);
  const count = await page.getByRole('tab').count();
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor:visible')).toContainText('dataclass');
  await expect(page.locator('.monaco-editor:visible')).toHaveCount(0);
  await expect(page.locator('#breadcrumb-name')).toHaveText('hello.py');
  expect(await page.getByRole('tab').count()).toBe(count);
  expect(await exportedText(page)).toBe(original);
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  expect(await exportedText(page)).toBe(original);
  await editCode(page, 'prefix');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('.bn-editor:visible')).toContainText('prefix');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedText(page)).toBe(original);
});

test('Markdown is editable through both engines without changing file identity', async ({ page }) => {
  await ready(page);
  const original = '# A heading\n\nA **bold** thought.\n\n<!-- keep this original -->\n';
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'shared.md', mimeType: 'text/markdown', buffer: Buffer.from(original) });
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.bn-editor:visible h1')).toContainText('A heading');
  await expect(page.locator('.bn-editor:visible strong')).toContainText('bold');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  expect(await exportedText(page)).toBe(original);
  await editCode(page, '## Added in source\n\n');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('.bn-editor:visible h2')).toContainText('Added in source');
  await page.locator('.bn-editor:visible').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(' Rich addition.');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.view-lines:visible')).toContainText('Rich addition.');
  await expect(page.locator('#breadcrumb-name')).toHaveText('shared.md');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export original version', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toContain('<!-- keep this original -->');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-state')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.view-lines:visible')).toContainText('Rich addition.');
});

test('legacy rich documents round-trip through Markdown source without edits or formatting loss', async ({
  page,
}) => {
  await ready(page);
  const before = JSON.parse(await exportedText(page));
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.view-lines:visible')).toContainText('Good things begin');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  expect(JSON.parse(await exportedText(page)).content).toEqual(before.content);
});

test('independent light and dark theme groups persist with dark colorful Write defaults and patterns', async ({
  page,
}) => {
  await ready(page);
  expect(await page.locator('body').evaluate((el) => el.style.getPropertyValue('--paper'))).toBe('#27374a');
  await expect(page.locator('body')).toHaveAttribute('data-scheme', 'dark');
  expect(
    await page.locator('#editor-stage').evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain('radial-gradient');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const name of ['Code mode style', 'Write mode style']) {
    const select = page.getByRole('combobox', { name, exact: true });
    await expect(select.locator('optgroup[label="Dark themes"] option')).not.toHaveCount(0);
    await expect(select.locator('optgroup[label="Light themes"] option')).not.toHaveCount(0);
  }
  await page.getByRole('combobox', { name: 'Code mode style', exact: true }).selectOption('Mist');
  await page.getByRole('combobox', { name: 'Write mode style', exact: true }).selectOption('Nebula');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'Nebula');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-scheme', 'light');
  await expect(page.locator('.monaco-editor:visible')).toBeVisible();
  await page.reload();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Code mode style', exact: true })).toHaveValue('Mist');
  await expect(page.getByRole('combobox', { name: 'Write mode style', exact: true })).toHaveValue('Nebula');
});

for (const nativeKind of ['markdown', 'rich']) {
  test(`${nativeKind} collaboration works across Monaco and BlockNote`, async ({ page, browser }) => {
    await ready(page);
    if (nativeKind === 'markdown') {
      await page.locator('#file-input').setInputFiles({
        name: 'collaborative.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Shared heading\n\nOriginal paragraph.\n'),
      });
      await expect(page.locator('.bn-editor:visible')).toContainText('Original paragraph.');
    }
    await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
    await expect(page.locator('#editor-loading')).toBeHidden();
    await page.getByRole('button', { name: '↗ Collaborate', exact: true }).click();
    await page.getByRole('button', { name: '↗ Share this document', exact: true }).click();
    const invitation = page.getByRole('textbox', { name: 'editor invitation' });
    await expect(invitation).toBeVisible();
    const link = await invitation.inputValue();
    const viewerLink = await page.getByRole('textbox', { name: 'viewer invitation' }).inputValue();
    await page.locator('#app-dialog .dialog-header button').click();
    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.locator('#connection-state')).toContainText('Connected');
    await expect(other.locator('.bn-editor:visible')).toContainText(
      nativeKind === 'rich' ? 'Good things begin' : 'Original paragraph.',
    );
    await editCode(page, '## From source\n\n');
    await expect(other.locator('.bn-editor:visible')).toContainText('From source');
    await other.locator('.bn-editor:visible').click();
    await other.keyboard.press('Control+End');
    await other.keyboard.press('Enter');
    await other.keyboard.type('From rich editing');
    await expect(page.locator('.view-lines:visible')).toContainText('From rich editing');
    // A joiner with Code as its saved preference must keep the existing root.
    await other.getByRole('button', { name: '⌘ Code', exact: true }).click();
    await expect(other.locator('.view-lines:visible')).toContainText('From source');
    await other.goto(link);
    await expect(other.locator('.view-lines:visible')).toContainText('From rich editing');
    await expect(page.locator('.view-lines:visible')).toContainText('From source');
    const viewerContext = await browser.newContext();
    const viewer = await viewerContext.newPage();
    await viewer.goto(viewerLink);
    await expect(viewer.locator('.bn-editor:visible')).toContainText('From rich editing');
    await expect(viewer.locator('.bn-editor:visible')).toHaveAttribute('contenteditable', 'false');
    await viewer.getByRole('button', { name: '⌘ Code', exact: true }).click();
    await expect(viewer.locator('.view-lines:visible')).toContainText('From rich editing');
    await editCode(viewer, 'FORBIDDEN');
    await expect(page.locator('.view-lines:visible')).not.toContainText('FORBIDDEN');
    await context.close();
    await viewerContext.close();
  });
}

test('new Write documents export real Markdown and use the same source in Code', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Control+n');
  await expect(page.locator('#breadcrumb-name')).toHaveText('Untitled.md');
  await expect(page.locator('#editor-loading')).toBeHidden();
  await page.locator('.bn-editor:visible').click();
  await page.keyboard.type('A new Markdown document');
  expect((await exportedText(page)).trim()).toBe('A new Markdown document');
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await expect(page.locator('.view-lines:visible')).toContainText('A new Markdown document');
  await editCode(page, '# A title\n\n');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('.bn-editor:visible h1')).toHaveText('A title');
  expect(await exportedText(page)).toContain('# A title');
});
