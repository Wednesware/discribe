import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import type { Adapter, Doc, Settings } from '../model';
import { textOf } from '../model';
import type { SessionProvider } from '../provider';
import { paletteFor } from '../appearance';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

export class WriteAdapter implements Adapter {
  editor: BlockNoteEditor;
  root: Root;
  ready: Promise<void>;
  private saved = '';
  private readonly = false;
  private settings!: Settings;
  constructor(
    container: HTMLElement,
    doc: Doc,
    settings: Settings,
    onChange: () => void,
    onSelection: () => void,
    provider?: SessionProvider,
  ) {
    this.editor = BlockNoteEditor.create({
      ...(provider
        ? {
            collaboration: {
              provider,
              fragment: provider.doc.getXmlFragment('write'),
              user: { name: settings.displayName, color: '#7889c1' },
              showCursorLabels: 'activity' as const,
            },
          }
        : { initialContent: (doc.content as any[]).length ? (doc.content as any) : undefined }),
      uploadFile: async (file: File) => {
        if (file.size > 5 * 1024 * 1024) throw Error('Attachments must be smaller than 5 MiB');
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      },
    });
    this.ready = new Promise((resolve) => {
      this.editor.onMount(() => resolve());
    });
    this.root = createRoot(container);
    this.configure(settings);
    this.saved = this.serialize();
    this.editor.onChange(onChange);
    this.editor.onSelectionChange(onSelection);
  }
  private render() {
    const palette = paletteFor(document.body.dataset.mode === 'code' ? 'code' : 'write', this.settings);
    const theme = {
      colors: {
        editor: { text: palette.text, background: palette.paper },
        menu: { text: palette.text, background: palette.raised },
        tooltip: { text: palette.text, background: palette.raised },
        hovered: { text: palette.text, background: palette.hover },
        selected: { text: palette.text, background: palette.soft },
        border: palette.line,
        sideMenu: palette.muted,
      },
      fontFamily: this.settings.writeFont,
    };
    this.root.render(<BlockNoteView editor={this.editor} theme={theme} editable={!this.readonly} />);
  }
  configure(s: Settings) {
    this.settings = s;
    document.documentElement.style.setProperty('--write-width', `${s.writeWidth}px`);
    document.documentElement.style.setProperty('--write-font', s.writeFont);
    this.render();
  }
  setReadOnly(value: boolean) {
    this.readonly = value;
    this.render();
  }
  getContent() {
    return this.editor.document;
  }
  setContent(content: any[]) {
    this.editor.replaceBlocks(this.editor.document, content as any);
  }
  focus() {
    this.editor.focus();
  }
  undo() {
    this.editor.undo();
  }
  redo() {
    this.editor.redo();
  }
  selection() {
    const text = textOf(this.editor.document).trim();
    return `${text ? text.split(/\s+/u).length : 0} words  ·  ${text.length} characters`;
  }
  async markdown() {
    return this.editor.blocksToMarkdownLossy(this.editor.document);
  }
  async importMarkdown(text: string) {
    this.setContent(await this.editor.tryParseMarkdownToBlocks(text));
  }
  serialize() {
    return JSON.stringify(this.getContent());
  }
  isDirty() {
    return this.saved !== this.serialize();
  }
  markSaved() {
    this.saved = this.serialize();
  }
  dispose() {
    this.root.unmount();
  }
}
