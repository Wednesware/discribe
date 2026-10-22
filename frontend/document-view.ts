import type { Adapter, Doc, Mode, Settings } from './model';
import type { CodeAdapter } from './editors/code';
import type { WriteAdapter } from './editors/write';
import type { SessionProvider } from './provider';
import type { BlockNoteEditor } from '@blocknote/core';

// Keep a document's storage format independent of the engine displaying it.
export class DocumentView implements Adapter {
  engine!: CodeAdapter | WriteAdapter;
  private parser?: BlockNoteEditor;
  private baseline = '';
  private canonical = '';
  private muted = false;
  private provider?: SessionProvider;
  private stopWatching?: () => void;
  private sourceBlocks = '';
  private sourceText = '';
  private sharedRichEditor?: WriteAdapter;
  private onChange!: () => void;
  private warning!: (message: string) => void;

  constructor(
    public document: Doc,
    public mode: Mode,
  ) {}

  static async create(
    container: HTMLElement,
    doc: Doc,
    mode: Mode,
    settings: Settings,
    onChange: () => void,
    onSelection: () => void,
    warning: (message: string) => void,
    provider?: SessionProvider,
    sharedRichEditor?: WriteAdapter,
  ): Promise<DocumentView> {
    const view = new DocumentView(doc, mode);
    view.onChange = onChange;
    view.warning = warning;
    view.sharedRichEditor = sharedRichEditor;
    if (mode !== doc.kind || doc.kind === 'write') {
      const { BlockNoteEditor } = await import('@blocknote/core');
      view.parser = BlockNoteEditor.create();
    }
    const content = view.project();
    const projected = {
      ...doc,
      kind: mode,
      content,
      language: doc.kind === 'write' ? 'markdown' : doc.language,
    };
    const changed = () => {
      if (!view.muted && view.engine) onChange();
    };
    const nativeProvider = mode === doc.kind ? provider : undefined;
    view.engine =
      mode === 'code'
        ? new (await import('./editors/code')).CodeAdapter(
            container,
            projected,
            settings,
            changed,
            onSelection,
            nativeProvider,
          )
        : new (await import('./editors/write')).WriteAdapter(
            container,
            projected,
            settings,
            changed,
            onSelection,
            nativeProvider,
          );
    if (mode === 'write') await (view.engine as WriteAdapter).ready;
    view.baseline = view.engine.serialize();
    view.canonical = JSON.stringify(doc.content);
    await view.bindSession(provider);
    return view;
  }

  private markdownBlocks(blocks: any[]): string {
    return this.parser!.blocksToMarkdownLossy(blocks);
  }
  private plainBlocks(text: string) {
    return text.split(/\r\n|\n|\r/).map((line) => ({ type: 'paragraph', content: line }));
  }
  private plainText(blocks: any[]): string {
    const inline = (content: any): string =>
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(inline).join('')
          : (content?.text ?? (content?.type === 'link' ? inline(content.content) : content?.url || ''));
    const lines = (items: any[]): string[] =>
      items.flatMap((block) => [
        block.content?.type === 'tableContent'
          ? block.content.rows.map((row: any) => row.cells.map(inline).join('\t')).join('\n')
          : inline(block.content),
        ...lines(block.children || []),
      ]);
    return lines(blocks).join(this.sourceText.includes('\r\n') ? '\r\n' : '\n');
  }
  private project(): string | any[] {
    const doc = this.document;
    if (this.mode === doc.kind) return doc.content;
    if (this.mode === 'code') {
      this.sourceBlocks = JSON.stringify(doc.content);
      this.sourceText =
        doc.sourceView?.blocks === this.sourceBlocks
          ? doc.sourceView.text
          : this.markdownBlocks(doc.content as any[]);
      return this.sourceText;
    }
    this.sourceText = doc.content as string;
    if (doc.richView?.source === this.sourceText) return doc.richView.blocks;
    return doc.language === 'markdown'
      ? this.parser!.tryParseMarkdownToBlocks(this.sourceText)
      : this.plainBlocks(this.sourceText);
  }

  getContent(): string | any[] {
    const doc = this.document;
    if (this.mode === doc.kind) return this.engine.getContent();
    // Viewing, saving, or switching alone must never normalize the original.
    if (this.engine.serialize() === this.baseline) return doc.content;
    if (this.mode === 'write') {
      const blocks = this.engine.getContent() as any[];
      const source =
        doc.language === 'markdown'
          ? (this.engine as WriteAdapter).editor.blocksToMarkdownLossy(blocks)
          : this.plainText(blocks);
      if (doc.language === 'markdown' && !doc.viewBackup) this.backup();
      doc.richView = { source, blocks: structuredClone(blocks) };
      return source;
    }
    const source = this.engine.getContent() as string;
    if (source === this.sourceText) return JSON.parse(this.sourceBlocks);
    if (doc.sourceView?.text === source) return JSON.parse(doc.sourceView.blocks);
    if (!doc.viewBackup) this.backup();
    const blocks = this.parser!.tryParseMarkdownToBlocks(source);
    doc.sourceView = { text: source, blocks: JSON.stringify(blocks) };
    return blocks;
  }
  private backup() {
    this.document.viewBackup = { content: structuredClone(this.document.content) };
    this.warning(
      'Editing the converted view can simplify Markdown formatting. Your original is kept in Document actions → Export original version.',
    );
  }
  capture() {
    const content = this.getContent();
    this.document.content = content;
    if (this.document.kind === 'write') this.document.markdown = this.markdown();
    this.canonical = JSON.stringify(content);
    if (this.provider && this.mode !== this.document.kind && this.provider.role !== 'viewer') {
      if (this.document.kind === 'code') {
        const text = this.provider.doc.getText('code');
        const old = text.toString(),
          next = content as string;
        if (old === next) return content;
        let prefix = 0,
          suffix = 0;
        while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
        while (
          suffix < old.length - prefix &&
          suffix < next.length - prefix &&
          old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
        )
          suffix++;
        this.provider.doc.transact(() => {
          text.delete(prefix, old.length - prefix - suffix);
          text.insert(prefix, next.slice(prefix, next.length - suffix));
        }, this);
      } else {
        // Apply source edits through the session's live BlockNote editor.
        this.provider.doc.transact(() => this.writeSharedBlocks(content as any[]), this);
      }
    }
    return content;
  }
  private writeSharedBlocks(blocks: any[]) {
    // Apply edits through the live collaborative editor; never rehydrate or
    // replace the Yjs fragment with an import utility during a session.
    const editor = this.sharedRichEditor?.editor;
    if (!editor) throw Error('The rich-text collaboration bridge is unavailable');
    const existing = editor.document;
    if (JSON.stringify(existing) === JSON.stringify(blocks)) return;
    const sameStructure =
      existing.length === blocks.length &&
      existing.every(
        (block, i) => block.type === blocks[i].type && !block.children.length && !blocks[i].children?.length,
      );
    if (sameStructure) {
      for (let i = 0; i < blocks.length; i++) {
        if (
          JSON.stringify(existing[i].content) !== JSON.stringify(blocks[i].content) ||
          JSON.stringify(existing[i].props) !== JSON.stringify(blocks[i].props)
        ) {
          editor.updateBlock(existing[i], { content: blocks[i].content, props: blocks[i].props });
        }
      }
    } else editor.replaceBlocks(existing, blocks);
    this.document.content = editor.document;
    this.document.sourceView = {
      text: this.engine.getContent() as string,
      blocks: JSON.stringify(editor.document),
    };
    this.canonical = JSON.stringify(editor.document);
  }
  async bindSession(provider?: SessionProvider) {
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.provider = provider;
    if (!provider) return;
    this.setReadOnly(provider.role === 'viewer');
    if (this.mode === this.document.kind) {
      if (this.mode === 'code') (this.engine as CodeAdapter).bindSession(provider);
      return;
    }
    const { yXmlFragmentToBlocks } = await import('@blocknote/core/yjs');
    const changed = (_event: unknown, transaction: { origin: unknown }) => {
      if (transaction.origin === this || this.muted) return;
      this.document.content =
        this.document.kind === 'code'
          ? provider.doc.getText('code').toString()
          : yXmlFragmentToBlocks(this.parser!, provider.doc.getXmlFragment('write'));
      this.syncFromDocument();
      this.onChange();
    };
    if (this.document.kind === 'code') {
      const root = provider.doc.getText('code');
      root.observe(changed);
      this.stopWatching = () => root.unobserve(changed);
    } else {
      const root = provider.doc.getXmlFragment('write');
      root.observeDeep(changed);
      this.stopWatching = () => root.unobserveDeep(changed);
    }
    changed(undefined, { origin: undefined });
  }
  unbindSession() {
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.provider = undefined;
    if (this.mode === 'code') (this.engine as CodeAdapter).unbindSession();
  }
  syncFromDocument() {
    if (this.canonical === JSON.stringify(this.document.content)) return;
    this.muted = true;
    try {
      const projected = this.project();
      if (JSON.stringify(this.engine.getContent()) !== JSON.stringify(projected)) {
        if (this.mode === 'code') (this.engine as CodeAdapter).setContent(projected as string);
        else (this.engine as WriteAdapter).setContent(projected as any[]);
      }
      this.baseline = this.engine.serialize();
      this.canonical = JSON.stringify(this.document.content);
    } finally {
      this.muted = false;
    }
  }
  setContent(content: any) {
    this.document.content = content;
    this.canonical = '';
    this.syncFromDocument();
  }
  markdown() {
    return this.document.kind === 'code'
      ? (this.document.content as string)
      : this.document.sourceView?.blocks === JSON.stringify(this.document.content)
        ? this.document.sourceView.text
        : this.markdownBlocks(this.document.content as any[]);
  }
  importMarkdown(text: string) {
    this.document.content =
      this.document.kind === 'code' ? text : this.parser!.tryParseMarkdownToBlocks(text);
    this.canonical = '';
    this.syncFromDocument();
    this.onChange();
  }
  setLanguage(language: string) {
    if (this.mode === 'code') (this.engine as CodeAdapter).setLanguage(language);
  }
  find() {
    if (this.mode === 'code') (this.engine as CodeAdapter).find();
  }
  palette() {
    if (this.mode === 'code') (this.engine as CodeAdapter).palette();
  }
  focus() {
    this.engine.focus();
  }
  undo() {
    this.engine.undo();
  }
  redo() {
    this.engine.redo();
  }
  selection() {
    return this.engine.selection();
  }
  configure(settings: Settings) {
    this.engine.configure(settings);
  }
  setReadOnly(value: boolean) {
    this.engine.setReadOnly(value);
  }
  serialize() {
    return JSON.stringify(this.getContent());
  }
  isDirty() {
    return this.engine.isDirty();
  }
  markSaved() {
    this.engine.markSaved();
  }
  dispose() {
    this.unbindSession();
    this.engine.dispose();
    this.parser?.unmount();
  }
}
