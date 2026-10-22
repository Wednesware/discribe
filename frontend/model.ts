export type Mode = 'code' | 'write';
export interface Doc {
  id: string;
  name: string;
  kind: Mode;
  preferredEditor: Mode;
  contentFormat: 'text' | 'blocknote';
  content: string | any[];
  language: string;
  workspace: string;
  createdAt: string;
  modifiedAt: string;
  revision: number;
  filePath?: string | null;
  collaboration?: { session: string; server: string } | null;
}
export interface Settings {
  defaultMode: Mode;
  codeStyle: string;
  writeStyle: string;
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  writeWidth: number;
  writeFont: string;
  autosave: boolean;
  reducedMotion: boolean;
  animations: boolean;
  sidebarCollapsed: boolean;
  displayName: string;
}
export const defaults: Settings = {
  defaultMode: 'write',
  codeStyle: 'Graphite',
  writeStyle: 'Grey blue',
  fontFamily: 'JetBrains Mono',
  fontSize: 14,
  tabSize: 4,
  wordWrap: true,
  minimap: false,
  writeWidth: 820,
  writeFont: 'Inter',
  autosave: true,
  reducedMotion: false,
  animations: true,
  sidebarCollapsed: false,
  displayName: 'Anonymous',
};
export const languageFor = (name: string) =>
  ({
    py: 'python',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    html: 'html',
    css: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    md: 'markdown',
    markdown: 'markdown',
    sh: 'shell',
    rs: 'rust',
    go: 'go',
    c: 'c',
    cpp: 'cpp',
    xml: 'xml',
    toml: 'ini',
  })[name.split('.').pop()?.toLowerCase() || ''] || 'plaintext';
export function newDoc(kind: Mode, name?: string, workspace = 'Personal'): Doc {
  const time = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name || (kind === 'code' ? 'Untitled.txt' : 'Untitled.discribe'),
    kind,
    preferredEditor: kind,
    contentFormat: kind === 'code' ? 'text' : 'blocknote',
    content: kind === 'code' ? '' : [{ type: 'paragraph', content: '' }],
    language: languageFor(name || ''),
    workspace,
    createdAt: time,
    modifiedAt: time,
    revision: 0,
  };
}
export function validateDoc(raw: any): Doc {
  if (
    !raw ||
    !['code', 'write'].includes(raw.kind) ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    raw.name.length > 255 ||
    (raw.kind === 'code' ? typeof raw.content !== 'string' : !Array.isArray(raw.content))
  )
    throw Error('Invalid Discribe document');
  return { ...newDoc(raw.kind), ...raw };
}
export function textOf(value: any): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (!value) return '';
  if (value.type === 'text') return value.text || '';
  return [value.content, value.children, value.rows, value.cells].filter(Boolean).map(textOf).join(' ');
}
export interface Adapter {
  getContent(): string | any[];
  setContent(content: any): void;
  focus(): void;
  undo(): void;
  redo(): void;
  selection(): string;
  isDirty(): boolean;
  markSaved(): void;
  serialize(): string;
  dispose(): void;
  configure(settings: Settings): void;
  setReadOnly(readonly: boolean): void;
}
declare global {
  interface Window {
    pywebview?: { api: Record<string, (...args: any[]) => Promise<any>> };
    MonacoEnvironment?: any;
  }
}
