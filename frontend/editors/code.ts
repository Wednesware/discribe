import * as monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type { Adapter, Doc, Settings } from '../model';
import type { SessionProvider } from '../provider';
import { paletteFor } from '../appearance';

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
      theme: 'vs-dark',
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
    const mode = document.body.dataset.mode === 'code' ? 'code' : 'write';
    const palette = paletteFor(mode, s);
    const theme = `discribe-${mode}-${mode === 'code' ? s.codeStyle : s.writeStyle}`.replace(
      /[^a-z0-9-]/gi,
      '-',
    );
    monaco.editor.defineTheme(theme, {
      base: palette.dark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: palette.dark
        ? [
            { token: 'comment', foreground: '929db3', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'c5b4ed' },
            { token: 'string', foreground: 'a5ceaf' },
          ]
        : [
            {
              token: 'comment',
              foreground: palette.family === 'mixed' ? palette.muted.slice(1) : '546b77',
              fontStyle: 'italic',
            },
            { token: 'keyword', foreground: palette.family === 'mixed' ? '50305e' : '654381' },
            { token: 'string', foreground: palette.family === 'mixed' ? '254c3b' : '2c6655' },
          ],
      colors: {
        'editor.background': palette.family === 'mixed' ? palette.paper : palette.background,
        'editor.foreground': palette.text,
        'editorLineNumber.foreground': palette.muted,
        'editorLineNumber.activeForeground': palette.text,
        'editor.selectionBackground': palette.accent + '44',
        'editorCursor.foreground': palette.accent,
        'editor.lineHighlightBackground': palette.soft + '55',
        'editorWidget.background': palette.raised,
        'editorSuggestWidget.background': palette.raised,
        'editorSuggestWidget.foreground': palette.text,
      },
    });
    monaco.editor.setTheme(theme);
    this.editor.updateOptions({
      fontFamily: s.fontFamily,
      fontSize: (s.fontSize * s.codeZoom) / 100,
      mouseWheelZoom: false,
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
