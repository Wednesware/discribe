import './style.css';
import { Storage } from './storage';
import {
  defaults,
  languageFor,
  newDoc,
  textOf,
  validateDoc,
  type Adapter,
  type Doc,
  type Mode,
  type Settings,
} from './model';
import type { CodeAdapter } from './editors/code';
import type { WriteAdapter } from './editors/write';
import type { SessionProvider } from './provider';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const element = (tag: string, text?: string, className?: string) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const actionButton = (text: string, action: () => void | Promise<void>, className = '') => {
  const b = element('button', text, className) as HTMLButtonElement;
  b.type = 'button';
  b.onclick = () => run(action);
  return b;
};
const storage = new Storage();
let settings: Settings = { ...defaults };
let docs: Doc[] = [];
let tabs: string[] = [];
let activeId = '';
let mode: Mode = 'write';
let workspace = 'Personal';
let recent = false;
let query = '';
let loadingVersion = 0;
let saves: Promise<void> = Promise.resolve();
const dirty = new Set<string>();
const adapters = new Map<string, Adapter>();
const containers = new Map<string, HTMLElement>();
const autosaves = new Map<string, ReturnType<typeof setTimeout>>();
let session: SessionProvider | undefined;
let sharedId = '';
let hostToken = '';
let invitations: Record<string, string> = {};
let sessionError = '';
let sessionServer = location.origin;
let channel: BroadcastChannel | undefined;
const active = () => docs.find((d) => d.id === activeId);
const title = (doc: Doc) => (doc.kind === 'write' ? doc.name.replace(/\.discribe$/i, '') : doc.name);

function notify(message: string, error = false) {
  const node = element('div', message, `toast ${error ? 'error' : ''}`);
  node.setAttribute('role', error ? 'alert' : 'status');
  $('#notifications').append(node);
  setTimeout(() => node.remove(), error ? 10000 : 4000);
}
async function run(fn: () => void | Promise<void>) {
  try {
    await fn();
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  }
}

function dialog(heading: string, subtitle = '') {
  const dlg = $<HTMLDialogElement>('#app-dialog');
  if (dlg.open) dlg.close();
  dlg.replaceChildren();
  dlg.setAttribute('aria-label', heading);
  const header = element('div', undefined, 'dialog-header');
  header.append(
    element('h2', heading),
    actionButton('×', () => dlg.close(), 'icon-button'),
  );
  dlg.append(header);
  if (subtitle) dlg.append(element('p', subtitle, 'dialog-description'));
  dlg.onclose = () =>
    requestAnimationFrame(() => {
      if (!$<HTMLDialogElement>('#app-dialog').open) adapters.get(activeId)?.focus();
    });
  dlg.showModal();
  return dlg;
}
async function choose(heading: string, message: string, choices: string[]): Promise<string | null> {
  const dlg = dialog(heading, message);
  const row = element('div', undefined, 'dialog-buttons');
  return new Promise((resolve) => {
    let result: string | null = null;
    for (const name of choices)
      row.append(
        actionButton(
          name,
          () => {
            result = name;
            dlg.close();
          },
          name === choices[0] ? 'primary' : 'secondary',
        ),
      );
    dlg.append(row);
    const closed = () => {
      if (dlg.open) return;
      dlg.removeEventListener('close', closed);
      resolve(result);
    };
    dlg.addEventListener('close', closed);
  });
}
async function ask(heading: string, value = '', description = ''): Promise<string | null> {
  const dlg = dialog(heading, description);
  const form = element('form') as HTMLFormElement;
  const input = element('input') as HTMLInputElement;
  input.value = value;
  input.required = true;
  input.autofocus = true;
  input.maxLength = 255;
  input.setAttribute('aria-label', heading);
  const row = element('div', undefined, 'dialog-buttons');
  const submit = element('button', 'Continue', 'primary') as HTMLButtonElement;
  submit.type = 'submit';
  row.append(
    actionButton('Cancel', () => dlg.close(), 'secondary'),
    submit,
  );
  form.append(input, row);
  dlg.append(form);
  input.focus();
  input.select();
  return new Promise((resolve) => {
    let result: string | null = null;
    form.onsubmit = (event) => {
      event.preventDefault();
      result = input.value.trim();
      if (result) dlg.close();
    };
    const closed = () => {
      if (dlg.open) return;
      dlg.removeEventListener('close', closed);
      resolve(result);
    };
    dlg.addEventListener('close', closed);
  });
}

function currentContent(doc: Doc) {
  const adapter = adapters.get(doc.id);
  if (adapter) doc.content = adapter.getContent();
  return doc;
}
function persistUI() {
  void storage
    .ui({ tabs, activeId, workspace, mode })
    .catch((error) => notify(`Cannot save workspace state: ${error}`, true));
}

function applySettings() {
  document.body.classList.toggle('sidebar-collapsed', settings.sidebarCollapsed);
  document.body.classList.toggle('reduce-motion', settings.reducedMotion || !settings.animations);
  document.documentElement.style.setProperty('--write-width', `${settings.writeWidth}px`);
  document.documentElement.style.setProperty('--write-font', settings.writeFont);
  for (const adapter of adapters.values()) adapter.configure(settings);
}
function render() {
  const doc = active();
  document.body.dataset.mode = mode;
  document.title = `${doc ? title(doc) + ' — ' : ''}Discribe`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.mode-button'))
    button.setAttribute('aria-pressed', String(button.dataset.action === `mode-${mode}`));
  const workspaces = [...new Set(['Personal', workspace, ...docs.map((d) => d.workspace)])];
  const select = $<HTMLSelectElement>('#workspace-select');
  select.replaceChildren(...workspaces.map((name) => new Option(name, name)));
  select.value = workspace;
  $('#breadcrumb-workspace').textContent = workspace;
  $('#breadcrumb-name').textContent = doc ? title(doc) : 'Your workspace';
  $('#document-title').textContent = doc ? title(doc) : 'A little space for something great.';
  $('#document-date').textContent = doc
    ? `Edited ${new Date(doc.modifiedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}  ·  Saved locally`
    : '';
  $('#save-state').textContent = dirty.size
    ? `${dirty.size} unsaved document${dirty.size === 1 ? '' : 's'}`
    : 'All changes saved';
  $('#save-state').classList.toggle('unsaved', dirty.size > 0);
  $('#document-heading').hidden = mode === 'code';
  $('#writing-page').hidden = mode === 'code';
  $('#code-editor').hidden = mode !== 'code';
  $<HTMLSelectElement>('#language-select').hidden = mode !== 'code';
  $('#encoding-status').hidden = mode !== 'code';
  if (doc) $<HTMLSelectElement>('#language-select').value = doc.language;
  $('#document-kind').textContent = sharedId === activeId ? '◉  SHARED DOCUMENT' : '✎  WRITING';
  $('#selection-status').textContent = doc ? adapters.get(doc.id)?.selection() || '' : '';
  const list = $('#document-list');
  list.replaceChildren();
  let filtered = docs.filter(
    (d) =>
      d.workspace === workspace &&
      (!query || `${d.name} ${textOf(d.content)}`.toLowerCase().includes(query.toLowerCase())),
  );
  filtered.sort((a, b) => (recent ? b.modifiedAt.localeCompare(a.modifiedAt) : a.name.localeCompare(b.name)));
  if (recent) filtered = filtered.slice(0, 12);
  for (const item of filtered) {
    const row = element('div', undefined, `document-row ${item.id === activeId ? 'selected' : ''}`);
    const b = actionButton('', () => activate(item.id), 'document-link');
    b.append(
      element('span', item.kind === 'code' ? '〈〉' : '▤', `file-icon ${item.kind}`),
      element('span', title(item)),
      element('span', dirty.has(item.id) ? '•' : '', 'dirty-dot'),
    );
    b.title = item.name;
    b.setAttribute('aria-label', `Open ${item.name}`);
    const menu = actionButton('⋯', () => documentMenu(item), 'row-menu');
    menu.setAttribute('aria-label', `Actions for ${item.name}`);
    row.append(b, menu);
    row.oncontextmenu = (event) => {
      event.preventDefault();
      documentMenu(item);
    };
    list.append(row);
  }
  if (!filtered.length)
    list.append(
      element(
        'p',
        query ? 'No matching documents' : 'A fresh space. Create a document to begin.',
        'empty-list',
      ),
    );
  const tabbar = $('#tabs');
  tabbar.replaceChildren();
  for (const id of tabs) {
    const item = docs.find((d) => d.id === id);
    if (!item) continue;
    const tab = element('div', undefined, `tab ${id === activeId ? 'active' : ''}`);
    tab.draggable = true;
    const b = actionButton(
      `${item.kind === 'code' ? '〈〉' : '▤'}  ${title(item)}${dirty.has(id) ? ' •' : ''}`,
      () => activate(id),
    );
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === activeId));
    b.id = `tab-${id}`;
    b.onkeydown = (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        run(() => nextTab(event.key === 'ArrowLeft' ? -1 : 1));
      }
    };
    const close = actionButton('×', () => closeTab(id), 'tab-close');
    close.setAttribute('aria-label', `Close ${item.name}`);
    tab.append(b, close);
    tab.ondragstart = (event) => event.dataTransfer?.setData('text/plain', id);
    tab.ondragover = (event) => event.preventDefault();
    tab.ondrop = (event) => {
      event.preventDefault();
      const source = event.dataTransfer?.getData('text/plain');
      if (!source || !tabs.includes(source)) return;
      tabs = tabs.filter((t) => t !== source);
      tabs.splice(tabs.indexOf(id), 0, source);
      render();
      persistUI();
    };
    tabbar.append(tab);
  }
  const add = actionButton('+', newDialog, 'tab-add');
  add.setAttribute('aria-label', 'New document');
  tabbar.append(add);
  for (const [id, node] of containers) node.hidden = id !== activeId;
  for (const b of document.querySelectorAll('.nav-item'))
    b.classList.toggle('active', b.getAttribute('data-action') === (recent ? 'recent' : 'all-documents'));
  updateConnection();
}

async function ensureAdapter(doc: Doc): Promise<Adapter> {
  if (adapters.has(doc.id)) return adapters.get(doc.id)!;
  const container = element('div', undefined, doc.kind === 'code' ? 'code-instance' : 'write-instance');
  container.setAttribute('role', 'tabpanel');
  container.setAttribute('aria-labelledby', `tab-${doc.id}`);
  containers.set(doc.id, container);
  (doc.kind === 'code' ? $('#code-editor') : $('#write-editor')).append(container);
  const args = [
    container,
    doc,
    settings,
    () => changed(doc.id),
    () => {
      if (activeId === doc.id) $('#selection-status').textContent = adapters.get(doc.id)?.selection() || '';
    },
    sharedId === doc.id ? session : undefined,
  ] as const;
  try {
    const adapter =
      doc.kind === 'code'
        ? new (await import('./editors/code')).CodeAdapter(...args)
        : new (await import('./editors/write')).WriteAdapter(...args);
    adapters.set(doc.id, adapter);
    if (sharedId === doc.id && session?.role === 'viewer') adapter.setReadOnly(true);
    if (doc.kind === 'write') await (adapter as WriteAdapter).ready;
    return adapter;
  } catch (error) {
    container.remove();
    containers.delete(doc.id);
    throw error;
  }
}

async function activate(id: string) {
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;
  const version = ++loadingVersion;
  activeId = id;
  mode = doc.kind;
  workspace = doc.workspace;
  if (!tabs.includes(id)) tabs.push(id);
  render();
  persistUI();
  $('#editor-loading').hidden = false;
  try {
    const adapter = await ensureAdapter(doc);
    if (version === loadingVersion) {
      render();
      adapter.focus();
    }
  } finally {
    if (version === loadingVersion) $('#editor-loading').hidden = true;
  }
}
async function nextTab(offset: number) {
  if (!tabs.length) return;
  await activate(tabs[(tabs.indexOf(activeId) + offset + tabs.length) % tabs.length]);
}
async function switchMode(next: Mode) {
  if (mode === next) return;
  const candidate =
    [...tabs]
      .reverse()
      .map((id) => docs.find((d) => d.id === id))
      .find((d) => d?.kind === next && d.workspace === workspace) ||
    docs.find((d) => d.kind === next && d.workspace === workspace);
  if (candidate) await activate(candidate.id);
  else await create(next);
}

function changed(id: string) {
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;
  currentContent(doc);
  doc.modifiedAt = new Date().toISOString();
  dirty.add(id);
  clearTimeout(autosaves.get(id));
  autosaves.set(
    id,
    setTimeout(
      () =>
        run(async () => {
          await storage.recover(currentContent(doc));
          if (settings.autosave) await save(doc);
        }),
      650,
    ),
  );
  // Update status without rebuilding sidebar DOM on every keystroke.
  $('#save-state').textContent = 'Unsaved changes';
  $('#save-state').classList.add('unsaved');
  if (id === activeId) $('#selection-status').textContent = adapters.get(id)?.selection() || '';
}

async function save(doc = active(), native = false, saveAs = false) {
  if (!doc) return;
  clearTimeout(autosaves.get(doc.id));
  const task = async () => {
    currentContent(doc);
    const content = JSON.stringify(doc.content);
    $('#save-state').textContent = 'Saving…';
    const snapshot = structuredClone(doc);
    try {
      const saved = await storage.save(snapshot);
      doc.revision = saved.revision;
      if (JSON.stringify(currentContent(doc).content) === content) {
        dirty.delete(doc.id);
        adapters.get(doc.id)?.markSaved();
        await storage.clearRecovery(doc.id);
      }
      channel?.postMessage({ id: doc.id });
      if (native && storage.native) {
        const result = await window.pywebview!.api.write_file(currentContent(doc), saveAs);
        if (result) {
          Object.assign(doc, result);
          const updated = await storage.save(structuredClone(doc));
          doc.revision = updated.revision;
        }
      } else if (saveAs) await exportDoc(doc);
    } catch (error) {
      dirty.add(doc.id);
      await storage.recover(currentContent(doc)).catch(() => {});
      throw error;
    } finally {
      render();
    }
  };
  const pending = saves.then(task);
  saves = pending.catch(() => {});
  await pending;
}

async function create(kind: Mode, name?: string) {
  const doc = newDoc(kind, name, workspace);
  docs.push(doc);
  dirty.add(doc.id);
  await save(doc);
  await activate(doc.id);
  return doc;
}
async function newDialog() {
  const dlg = dialog('Make room for an idea', 'Start with a blank page or a fresh line of code.');
  const choices = element('div', undefined, 'new-choices');
  for (const [kind, name, description] of [
    ['write', '✎  Write document', 'Notes, stories, plans, and everything in between.'],
    ['code', '〈〉  Code document', 'A focused editor for your next great build.'],
  ] as const) {
    const b = actionButton(
      '',
      async () => {
        dlg.close();
        await create(kind);
      },
      'new-choice',
    );
    b.append(element('strong', name), element('span', description));
    choices.append(b);
  }
  dlg.append(
    choices,
    actionButton(
      '↥  Open an existing file',
      async () => {
        dlg.close();
        await openFiles();
      },
      'secondary',
    ),
  );
}

async function closeTab(id: string) {
  if (dirty.has(id)) {
    const choice = await choose(
      'Save before closing?',
      'Your changes are kept in recovery until you save or explicitly discard them.',
      ['Save', 'Discard', 'Cancel'],
    );
    if (choice === 'Save') await save(docs.find((d) => d.id === id));
    else if (choice === 'Discard') {
      const saved = (await storage.list()).find((d) => d.id === id);
      if (saved)
        Object.assign(
          docs.find((d) => d.id === id)!,
          saved,
        );
      dirty.delete(id);
      await storage.clearRecovery(id);
    } else return;
  }
  if (sharedId === id) await leaveSession();
  clearTimeout(autosaves.get(id));
  tabs = tabs.filter((t) => t !== id);
  adapters.get(id)?.dispose();
  adapters.delete(id);
  containers.get(id)?.remove();
  containers.delete(id);
  if (activeId === id) {
    activeId = '';
    const next = tabs.at(-1);
    if (next) await activate(next);
    else {
      render();
      $('#editor-loading').hidden = true;
    }
  }
  render();
  persistUI();
}
async function duplicate(doc: Doc) {
  currentContent(doc);
  const copy = {
    ...structuredClone(doc),
    id: crypto.randomUUID(),
    name: doc.name.replace(/(\.[^.]+)?$/, ' copy$1'),
    revision: 0,
    filePath: null,
    collaboration: null,
    createdAt: new Date().toISOString(),
  };
  docs.push(copy);
  dirty.add(copy.id);
  await save(copy);
  await activate(copy.id);
}
async function rename(doc: Doc) {
  const name = await ask('Rename document', doc.name);
  if (!name) return;
  doc.name = name;
  if (doc.kind === 'code') {
    doc.language = languageFor(name);
    (adapters.get(doc.id) as CodeAdapter | undefined)?.setLanguage(doc.language);
  }
  dirty.add(doc.id);
  await save(doc);
  render();
}
async function deleteDoc(doc: Doc) {
  const choice = await choose(
    'Delete document?',
    `“${title(doc)}” will be removed from this workspace. Export a copy first if you need it. Native files are kept on disk.`,
    ['Cancel', 'Delete'],
  );
  if (choice !== 'Delete') return;
  if (sharedId === doc.id) await leaveSession();
  clearTimeout(autosaves.get(doc.id));
  await saves;
  await storage.remove(doc);
  dirty.delete(doc.id);
  await closeTab(doc.id);
  docs = docs.filter((d) => d.id !== doc.id);
  render();
}
function documentMenu(doc = active()) {
  if (!doc) return;
  const dlg = dialog(title(doc), 'Document actions');
  const list = element('div', undefined, 'action-list');
  const entries: [string, () => void | Promise<void>][] = [
    ['Save', () => save(doc, true)],
    ['Save As / Export', () => save(doc, true, true)],
    ['Rename', () => rename(doc)],
    ['Duplicate', () => duplicate(doc)],
    [
      'Move to workspace',
      async () => {
        const name = await ask('Move to workspace', doc.workspace);
        if (name) {
          doc.workspace = name;
          workspace = name;
          dirty.add(doc.id);
          await save(doc);
          render();
        }
      },
    ],
  ];
  if (doc.kind === 'code' && doc.language === 'markdown')
    entries.push(['Create a rich-text copy…', () => convertMarkdown(doc)]);
  if (doc.kind === 'write') entries.push(['Export Markdown…', () => exportDoc(doc, true)]);
  if (doc.kind === 'code')
    entries.push([
      'Monaco command palette',
      async () => {
        await activate(doc.id);
        (adapters.get(doc.id) as CodeAdapter).palette();
      },
    ]);
  entries.push(['Delete document', () => deleteDoc(doc)]);
  for (const [label, action] of entries)
    list.append(
      actionButton(
        label,
        async () => {
          dlg.close();
          await action();
        },
        label.startsWith('Delete') ? 'danger' : '',
      ),
    );
  dlg.append(list);
}

async function openFiles() {
  if (storage.native) {
    const raw = await window.pywebview!.api.open_file();
    if (raw) {
      const doc = validateDoc(raw);
      doc.workspace = workspace;
      docs.push(doc);
      dirty.add(doc.id);
      await save(doc);
      await activate(doc.id);
    }
  } else $<HTMLInputElement>('#file-input').click();
}
async function importFile(file: File) {
  if (file.size > 20 * 1024 * 1024) throw Error(`${file.name} exceeds 20 MiB`);
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw Error('This file is not valid UTF-8 text');
  }
  if (source.includes('\0')) throw Error('Binary files cannot be opened as text');
  let doc: Doc;
  if (file.name.endsWith('.discribe')) {
    doc = validateDoc(JSON.parse(source));
    doc.id = crypto.randomUUID();
    doc.revision = 0;
    doc.filePath = null;
    doc.collaboration = null;
    doc.workspace = workspace;
  } else {
    doc = newDoc('code', file.name, workspace);
    doc.content = source;
  }
  docs.push(doc);
  dirty.add(doc.id);
  await save(doc);
  await activate(doc.id);
  notify(`Opened ${file.name}`);
}
function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = element('a') as HTMLAnchorElement;
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportDoc(doc = active(), markdown = false) {
  if (!doc) return;
  currentContent(doc);
  if (doc.kind === 'write' && markdown) {
    const content = await ((await ensureAdapter(doc)) as WriteAdapter).markdown();
    download(title(doc) + '.md', content, 'text/markdown;charset=utf-8');
  } else if (doc.kind === 'write') {
    const portable = { ...doc, filePath: null, collaboration: null };
    download(
      doc.name.endsWith('.discribe') ? doc.name : doc.name + '.discribe',
      JSON.stringify(portable, null, 2),
      'application/json',
    );
  } else download(doc.name, doc.content as string, 'text/plain;charset=utf-8');
}
async function convertMarkdown(doc: Doc) {
  const answer = await choose(
    'Create a rich-text copy?',
    'Markdown import can simplify unsupported formatting. Your original source and unsaved changes will be preserved in this document.',
    ['Create copy', 'Cancel'],
  );
  if (answer !== 'Create copy') return;
  currentContent(doc);
  const copy = await create('write', doc.name.replace(/\.[^.]+$/, '') + '.discribe');
  await (adapters.get(copy.id) as WriteAdapter).importMarkdown(doc.content as string);
  dirty.add(copy.id);
  await save(copy);
}

function settingsDialog() {
  const dlg = dialog('Make yourself at home', 'A few small adjustments for the way you work.');
  const form = element('form', undefined, 'settings-form') as HTMLFormElement;
  const draft = { ...settings };
  function field(
    label: string,
    key: keyof Settings,
    type: 'text' | 'number' | 'checkbox' | 'select',
    options?: string[],
    min?: number,
    max?: number,
  ) {
    const row = element('label', undefined, 'setting-row');
    row.append(element('span', label));
    const input =
      type === 'select' ? (element('select') as HTMLSelectElement) : (element('input') as HTMLInputElement);
    input.setAttribute('aria-label', label);
    input.name = key;
    if (type === 'select')
      for (const value of options || []) (input as HTMLSelectElement).add(new Option(value, value));
    else {
      (input as HTMLInputElement).type = type;
      if (min !== undefined) input.setAttribute('min', String(min));
      if (max !== undefined) input.setAttribute('max', String(max));
    }
    if (type === 'checkbox') (input as HTMLInputElement).checked = Boolean(draft[key]);
    else input.value = String(draft[key]);
    input.onchange = () => {
      (draft as any)[key] =
        type === 'checkbox'
          ? (input as HTMLInputElement).checked
          : type === 'number'
            ? Number(input.value)
            : input.value;
    };
    row.append(input);
    form.append(row);
  }
  form.append(element('h3', 'Your workspace'));
  field('Default environment', 'defaultMode', 'select', ['write', 'code']);
  field('Autosave', 'autosave', 'checkbox');
  field('Collapse sidebar', 'sidebarCollapsed', 'checkbox');
  field('Animations', 'animations', 'checkbox');
  field('Reduce motion', 'reducedMotion', 'checkbox');
  form.append(element('h3', 'Code editor'));
  field('Font family', 'fontFamily', 'text');
  field('Font size', 'fontSize', 'number', undefined, 10, 32);
  field('Tab size', 'tabSize', 'select', ['2', '4', '8']);
  field('Word wrap', 'wordWrap', 'checkbox');
  field('Minimap', 'minimap', 'checkbox');
  form.append(element('h3', 'Writing & collaboration'));
  field('Page width (px)', 'writeWidth', 'number', undefined, 480, 1200);
  field('Writing font', 'writeFont', 'select', ['Inter', 'Georgia', 'system-ui']);
  field('Display name', 'displayName', 'text');
  const submit = element('button', 'Save preferences', 'primary') as HTMLButtonElement;
  submit.type = 'submit';
  form.append(submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    run(async () => {
      draft.tabSize = Number(draft.tabSize);
      settings = draft;
      await storage.settings(settings);
      applySettings();
      render();
      dlg.close();
      if (settings.autosave) for (const id of dirty) await save(docs.find((d) => d.id === id));
      notify('Your preferences are saved');
    });
  };
  dlg.append(form);
}

function updateConnection() {
  $('#connection-state').textContent = session
    ? `${session.connected ? 'Connected' : session.stopped ? 'Disconnected' : 'Reconnecting…'} · ${session.participants.length} participant${session.participants.length === 1 ? '' : 's'} · ${session.role}`
    : 'Local workspace';
  const peers = document.querySelector<HTMLElement>('[data-participants]');
  if (peers && session)
    peers.replaceChildren(
      ...session.participants.map((peer) => element('div', `${peer.name} · ${peer.role}`)),
    );
}
function serverURL(value: string) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw Error('Use an http:// or https:// host URL');
  return url.origin;
}
function inviteLink(server: string, id: string, token: string) {
  return `${server}/editor/#${new URLSearchParams({ session: id, token })}`;
}
async function connectSession(server: string, id: string, token: string, local?: Doc) {
  if (session) await leaveSession();
  sessionError = '';
  const Provider = (await import('./provider')).SessionProvider;
  const provider = new Provider(serverURL(server), id, token, settings.displayName);
  session = provider;
  sessionServer = provider.server;
  provider.on('status', updateConnection);
  provider.on('presence', updateConnection);
  provider.on('error', (message: string) => {
    sessionError = message;
    notify(message, true);
    updateConnection();
  });
  void provider.connect();
  updateConnection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      provider.ready,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error(sessionError || 'Could not connect to the host. Your local document is safe.')),
          12000,
        );
      }),
    ]);
  } catch (error) {
    await leaveSession();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const metadata = provider.metadata!;
  const doc = local || newDoc(metadata.kind, metadata.name, workspace);
  if (doc.kind !== metadata.kind) {
    await leaveSession();
    throw Error('The session uses a different editor format');
  }
  doc.language = metadata.language;
  doc.collaboration = { session: id, server: provider.server };
  if (!local) {
    docs.push(doc);
    await save(doc);
  } else currentContent(doc);
  const initial = structuredClone(doc.content);
  if (local && metadata.kind === 'code' && provider.doc.getText('code').length === 0)
    provider.doc.getText('code').insert(0, initial as string);
  sharedId = doc.id;
  if (doc.kind === 'code' && adapters.has(doc.id))
    (adapters.get(doc.id) as CodeAdapter).bindSession(provider);
  else {
    adapters.get(doc.id)?.dispose();
    adapters.delete(doc.id);
    containers.get(doc.id)?.remove();
    containers.delete(doc.id);
  }
  await activate(doc.id);
  if (local && metadata.kind === 'write' && provider.doc.getXmlFragment('write').length === 0)
    (adapters.get(doc.id) as WriteAdapter).setContent(initial as any[]);
  // BlockNote may initialize an empty paragraph when mounting an empty Y fragment.
  if (
    local &&
    metadata.kind === 'write' &&
    !textOf((adapters.get(doc.id) as WriteAdapter).getContent()).trim() &&
    textOf(initial).trim()
  )
    (adapters.get(doc.id) as WriteAdapter).setContent(initial as any[]);
  dirty.add(doc.id);
  await save(doc);
  notify('You are connected. Changes sync automatically.');
}
async function leaveSession() {
  if (!session) return;
  const old = session;
  session = undefined;
  const doc = docs.find((d) => d.id === sharedId);
  const id = sharedId;
  sharedId = '';
  hostToken = '';
  invitations = {};
  if (doc) {
    currentContent(doc);
    doc.collaboration = null;
  }
  if (doc?.kind === 'code' && adapters.has(id)) (adapters.get(id) as CodeAdapter).unbindSession();
  else {
    adapters.get(id)?.dispose();
    adapters.delete(id);
    containers.get(id)?.remove();
    containers.delete(id);
  }
  await old.destroy();
  if (doc) {
    dirty.add(doc.id);
    await save(doc);
    if (id === activeId) await activate(id);
  }
  updateConnection();
}
function collaborationDialog() {
  const dlg = dialog(
    'A little better, together',
    session
      ? 'Live changes are synchronized through Yjs and Beryllium.'
      : 'Share an idea or build something together. A running Beryllium host is required.',
  );
  if (session) {
    dlg.append(
      element(
        'p',
        `${session.connected ? 'Connected' : 'Disconnected'} · ${session.role} · ${session.session}`,
        'session-info',
      ),
    );
    const peers = element('div', undefined, 'participants');
    peers.dataset.participants = '';
    for (const peer of session.participants) peers.append(element('div', `${peer.name} · ${peer.role}`));
    dlg.append(peers);
    if (hostToken) {
      for (const role of ['editor', 'viewer']) {
        const link = invitations[role];
        const row = element('label', undefined, 'invite-row');
        row.append(element('span', `${role === 'editor' ? 'Can edit' : 'View only'} invitation`));
        const input = element('input') as HTMLInputElement;
        input.readOnly = true;
        input.value = link;
        input.setAttribute('aria-label', `${role} invitation`);
        row.append(
          input,
          actionButton(
            'Copy',
            async () => {
              await navigator.clipboard.writeText(link);
              notify('Invitation copied');
            },
            'secondary',
          ),
        );
        dlg.append(row);
      }
      dlg.append(
        actionButton(
          'End session for everyone',
          async () => {
            const response = await fetch(`${sessionServer}/discribe/api/sessions/${session!.session}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${hostToken}` },
            });
            if (!response.ok) throw Error('Could not end the session');
            await leaveSession();
            dlg.close();
          },
          'danger',
        ),
      );
    }
    dlg.append(
      actionButton(
        'Leave & keep a local copy',
        async () => {
          await leaveSession();
          dlg.close();
        },
        'secondary',
      ),
    );
    return;
  }
  const form = element('div', undefined, 'collaboration-form');
  const label = element('label', 'Beryllium host URL');
  const server = element('input') as HTMLInputElement;
  server.type = 'url';
  server.placeholder = 'http://localhost:8080';
  server.value = location.origin;
  server.setAttribute('aria-label', 'Beryllium host URL');
  label.append(server);
  form.append(
    label,
    actionButton(
      '↗  Share this document',
      async () => {
        const doc = active();
        if (!doc) throw Error('Create or open a document first');
        const origin = serverURL(server.value);
        await save(doc);
        const response = await fetch(`${origin}/discribe/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: doc.name, kind: doc.kind, language: doc.language }),
        });
        if (!response.ok)
          throw Error(
            'The host could not create a session. Check the host URL and available session capacity.',
          );
        const result = await response.json();
        dlg.close();
        await connectSession(origin, result.id, result.tokens.host, doc);
        hostToken = result.tokens.host;
        invitations = Object.fromEntries(
          ['editor', 'viewer'].map((role) => [role, inviteLink(origin, result.id, result.tokens[role])]),
        );
        collaborationDialog();
      },
      'primary',
    ),
  );
  form.append(element('hr'), element('label', 'Have an invitation?'));
  const invite = element('input') as HTMLInputElement;
  invite.placeholder = 'Paste an invitation link';
  invite.setAttribute('aria-label', 'Invitation link');
  form.append(
    invite,
    actionButton(
      'Join session',
      async () => {
        const url = new URL(invite.value);
        const params = new URLSearchParams(url.hash.slice(1));
        const id = params.get('session');
        const token = params.get('token');
        if (!id || !token) throw Error('The invitation must include a session and token');
        dlg.close();
        await connectSession(url.origin, id, token);
      },
      'secondary',
    ),
  );
  dlg.append(form);
}

const actions: Record<string, () => void | Promise<void>> = {
  'mode-code': () => switchMode('code'),
  'mode-write': () => switchMode('write'),
  sidebar: async () => {
    settings.sidebarCollapsed = !settings.sidebarCollapsed;
    applySettings();
    await storage.settings(settings);
  },
  settings: settingsDialog,
  new: newDialog,
  'document-menu': () => documentMenu(),
  export: () => exportDoc(),
  undo: () => adapters.get(activeId)?.undo(),
  redo: () => adapters.get(activeId)?.redo(),
  find: async () => {
    if (mode === 'code') (adapters.get(activeId) as CodeAdapter | undefined)?.find();
    else {
      const text = await ask('Find in document', '', 'Search the text on this page.');
      if (text) (window as Window & { find?: (text: string) => boolean }).find?.(text);
    }
  },
  'all-documents': () => {
    recent = false;
    render();
  },
  recent: () => {
    recent = true;
    render();
  },
  'workspace-new': async () => {
    const name = await ask('New workspace');
    if (name) {
      workspace = name;
      render();
      persistUI();
      await create(settings.defaultMode);
    }
  },
  collaborate: collaborationDialog,
};
document.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action && actions[action]) run(actions[action]);
});
$<HTMLInputElement>('#document-search').oninput = (event) => {
  query = (event.target as HTMLInputElement).value;
  render();
};
$<HTMLSelectElement>('#workspace-select').onchange = (event) => {
  workspace = (event.target as HTMLSelectElement).value;
  render();
  persistUI();
};
$<HTMLInputElement>('#file-input').onchange = (event) =>
  run(async () => {
    const input = event.target as HTMLInputElement;
    for (const file of input.files || []) await importFile(file);
    input.value = '';
  });
$<HTMLSelectElement>('#language-select').onchange = (event) =>
  run(async () => {
    const doc = active();
    if (!doc || doc.kind !== 'code') return;
    doc.language = (event.target as HTMLSelectElement).value;
    (adapters.get(doc.id) as CodeAdapter).setLanguage(doc.language);
    dirty.add(doc.id);
    await save(doc);
  });
$('#document-title').onclick = () =>
  run(async () => {
    const doc = active();
    if (doc) await rename(doc);
  });
document.addEventListener(
  'keydown',
  (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    let fn: (() => void | Promise<void>) | undefined;
    if (key === 's') fn = () => save(active(), true, event.shiftKey);
    if (key === 'n') fn = () => create(mode).then(() => {});
    if (key === 'o') fn = openFiles;
    if (key === 'w' && !$<HTMLDialogElement>('#app-dialog').open) fn = () => closeTab(activeId);
    if (key === 'tab') fn = () => nextTab(event.shiftKey ? -1 : 1);
    if (key === ',') fn = settingsDialog;
    if (key === 'k' && !event.shiftKey)
      fn = () => {
        $('#document-search').focus();
      };
    if (key === 'f' && mode === 'write') return; // browser find works in rich text
    if (fn) {
      event.preventDefault();
      event.stopPropagation();
      run(fn);
    }
  },
  true,
);
window.addEventListener('beforeunload', (event) => {
  if (dirty.size || (session && !session.connected)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden')
    for (const id of dirty) {
      const doc = docs.find((d) => d.id === id);
      if (doc) void storage.recover(currentContent(doc)).catch(() => {});
    }
});
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (event.dataTransfer?.files.length) {
    event.preventDefault();
    run(async () => {
      for (const file of event.dataTransfer!.files) await importFile(file);
    });
  }
});

async function start() {
  await storage.open();
  settings = await storage.settings();
  docs = await storage.list();
  const ui = await storage.ui();
  if (!ui && matchMedia('(max-width: 800px)').matches) {
    settings.sidebarCollapsed = true;
    await storage.settings(settings);
  }
  applySettings();
  for (const recovered of await storage.recovery()) {
    const saved = docs.find((d) => d.id === recovered.id);
    if (saved && JSON.stringify(saved.content) === JSON.stringify(recovered.content)) {
      await storage.clearRecovery(recovered.id);
      continue;
    }
    // Recover to a separate copy, preserving any version written by another window.
    const copy = {
      ...recovered,
      id: crypto.randomUUID(),
      revision: 0,
      name: `${title(recovered)} (recovered)${recovered.kind === 'write' ? '.discribe' : ''}`,
      filePath: null,
      collaboration: null,
    };
    docs.push(copy);
    await save(copy);
    await storage.clearRecovery(recovered.id);
    notify('Recovered interrupted changes in a separate document.');
  }
  if (!docs.length) {
    const welcome = newDoc('write', 'Welcome to your space.discribe');
    welcome.content = [
      { type: 'heading', props: { level: 2 }, content: 'Good things begin with a little space.' },
      {
        type: 'paragraph',
        content:
          'A thought you don’t want to lose. A story you’re ready to tell. A project waiting for its first line of code. This is your place for all of it.',
      },
      { type: 'heading', props: { level: 3 }, content: 'Two ways to find your flow' },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Write', styles: { bold: true } },
          {
            type: 'text',
            text: ' gives your ideas room to breathe. Add headings, lists, tables, and images. Type / on an empty line to see what’s possible.',
            styles: {},
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Code', styles: { bold: true } },
          {
            type: 'text',
            text: ' puts a powerful Monaco editor at your fingertips. Switch environments above — every document stays exactly as you left it.',
            styles: {},
          },
        ],
      },
      { type: 'heading', props: { level: 3 }, content: 'Make yourself at home' },
      { type: 'checkListItem', props: { checked: true }, content: 'Find a quiet corner for your ideas' },
      { type: 'checkListItem', props: { checked: false }, content: 'Create your first document' },
      { type: 'checkListItem', props: { checked: false }, content: 'Make something that feels like you' },
      {
        type: 'quote',
        content: 'Your work stays on your device. No account, no distractions. Just you and what comes next.',
      },
    ];
    const code = newDoc('code', 'hello.py');
    code.content =
      '# A little space for your next great build.\n\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass Idea:\n    name: str\n    ready: bool = False\n\n    def begin(self) -> str:\n        self.ready = True\n        return f"Let’s make {self.name}."\n\n\nif __name__ == "__main__":\n    idea = Idea("something wonderful")\n    print(idea.begin())\n';
    docs.push(welcome, code);
    await save(welcome);
    await save(code);
  }
  workspace = ui?.workspace || 'Personal';
  tabs = (ui?.tabs || []).filter((id: string) => docs.some((d) => d.id === id));
  const initial =
    docs.find((d) => d.id === ui?.activeId) || docs.find((d) => d.kind === settings.defaultMode) || docs[0];
  await activate(initial.id);
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('discribe');
    channel.onmessage = () =>
      notify('Another window saved a document. Revision checks protect your current changes.');
  }
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('session') && params.has('token')) {
    const id = params.get('session')!,
      token = params.get('token')!;
    history.replaceState(null, '', location.pathname + location.search);
    await connectSession(location.origin, id, token);
  }
  if ('serviceWorker' in navigator && !storage.native && ['https:', 'http:'].includes(location.protocol)) {
    navigator.serviceWorker
      .register(new URL('./sw.js', location.href), { scope: './' })
      .catch((error) => console.warn('Offline cache unavailable', error));
  }
}
run(start);
