import * as monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type { Adapter, Doc, Settings } from '../model';
import type { SessionProvider } from '../provider';

window.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    const worker = ['typescript', 'javascript'].includes(label)
      ? 'ts'
      : ['css', 'scss', 'less'].includes(label)
        ? 'css'
        : ['html', 'handlebars', 'razor'].includes(label)
          ? 'html'
          : label === 'json'
            ? 'json'
            : 'editor';
    return new Worker(new URL(`../${worker}.worker.js`, import.meta.url), { type: 'module' });
  },
};
monaco.editor.defineTheme('discribe', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '737e95', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'b3a2ec' },
    { token: 'string', foreground: 'a5c6ac' },
    { token: 'number', foreground: 'dfb990' },
    { token: 'type.identifier', foreground: '8fb7dc' },
  ],
  colors: {
    'editor.background': '#16181f',
    'editor.foreground': '#d5d9e4',
    'editorLineNumber.foreground': '#555d70',
    'editorLineNumber.activeForeground': '#b9b2de',
    'editor.selectionBackground': '#53517666',
    'editor.lineHighlightBackground': '#ffffff04',
    'editorCursor.foreground': '#b3a2ec',
    'editorWidget.background': '#222531',
  },
});

export class CodeAdapter implements Adapter {
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  private saved = '';
  private binding?: MonacoBinding;
  constructor(
    container: HTMLElement,
    doc: Doc,
    settings: Settings,
    onChange: () => void,
    onSelection: () => void,
    provider?: SessionProvider,
  ) {
    this.model = monaco.editor.createModel(
      doc.content as string,
      doc.language,
      monaco.Uri.parse(`inmemory://discribe/${doc.id}/${encodeURIComponent(doc.name)}`),
    );
    this.editor = monaco.editor.create(container, {
      model: this.model,
      theme: 'discribe',
      automaticLayout: true,
      padding: { top: 24, bottom: 24 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      accessibilitySupport: 'auto',
      ariaLabel: doc.name,
      renderLineHighlight: 'all',
      editContext: false,
    });
    this.configure(settings);
    if (provider) this.bindSession(provider);
    this.saved = this.serialize();
    this.model.onDidChangeContent(onChange);
    this.editor.onDidChangeCursorSelection(onSelection);
  }
  configure(s: Settings) {
    this.editor.updateOptions({
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      wordWrap: s.wordWrap ? 'on' : 'off',
      minimap: { enabled: s.minimap },
      smoothScrolling: s.animations && !s.reducedMotion,
      cursorSmoothCaretAnimation: s.reducedMotion ? 'off' : 'on',
    });
    this.model.updateOptions({ tabSize: s.tabSize, insertSpaces: true });
  }
  bindSession(provider: SessionProvider) {
    this.unbindSession();
    this.binding = new MonacoBinding(
      provider.doc.getText('code'),
      this.model,
      new Set([this.editor]),
      provider.awareness,
    );
    this.setReadOnly(provider.role === 'viewer');
  }
  unbindSession() {
    this.binding?.destroy();
    this.binding = undefined;
    this.setReadOnly(false);
  }
  setReadOnly(readOnly: boolean) {
    this.editor.updateOptions({ readOnly });
  }
  getContent() {
    return this.model.getValue();
  }
  setContent(content: string) {
    this.model.setValue(content);
  }
  setLanguage(language: string) {
    monaco.editor.setModelLanguage(this.model, language);
  }
  focus() {
    const input = this.editor.getDomNode()?.querySelector('textarea');
    if (input && document.activeElement === input) input.blur();
    this.editor.render(true);
    this.editor.focus();
  }
  undo() {
    this.editor.trigger('discribe', 'undo', null);
  }
  redo() {
    this.editor.trigger('discribe', 'redo', null);
  }
  find() {
    void this.editor.getAction('actions.find')?.run();
  }
  palette() {
    void this.editor.getAction('editor.action.quickCommand')?.run();
  }
  selection() {
    const p = this.editor.getPosition();
    return `Ln ${p?.lineNumber || 1}, Col ${p?.column || 1}`;
  }
  serialize() {
    return this.getContent();
  }
  isDirty() {
    return this.saved !== this.serialize();
  }
  markSaved() {
    this.saved = this.serialize();
  }
  dispose() {
    this.binding?.destroy();
    this.editor.dispose();
    this.model.dispose();
  }
}
