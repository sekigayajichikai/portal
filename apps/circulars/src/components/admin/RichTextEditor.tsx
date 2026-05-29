/**
 * WYSIWYGリッチテキストエディタ
 *
 * Tiptapベース。Markdownを知らない人でもWordのように編集できる。
 * 内部的にはMarkdown形式で入出力する（保存時の互換性を維持）。
 */

import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Minus,
  Undo2,
  Redo2,
} from 'lucide-react';

// Turndown設定（HTML→Markdown変換）
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// テーブル変換ルール（Tiptapはtableを非対応だが、HTMLを壊さずMarkdownに戻す）
turndown.addRule('table', {
  filter: ['table'],
  replacement(_content, node) {
    const table = node as HTMLTableElement;
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll('th, td').forEach((cell) => {
        cells.push((cell.textContent || '').trim());
      });
      if (cells.length > 0) rows.push(cells);
    });
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map((r) => r.length));
    const lines: string[] = [];
    rows.forEach((row, i) => {
      const padded = Array.from({ length: colCount }, (_, c) => row[c] || '');
      lines.push('| ' + padded.join(' | ') + ' |');
      if (i === 0) {
        lines.push('| ' + padded.map(() => '---').join(' | ') + ' |');
      }
    });
    return '\n\n' + lines.join('\n') + '\n\n';
  },
});

// thead/tbody/tr/td/thはtableルール内で処理するので無視
turndown.addRule('tableElements', {
  filter: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'],
  replacement(content) {
    return content;
  },
});

// marked設定（Markdown→HTML変換）
marked.setOptions({
  breaks: true,
  gfm: true,
});

/** Markdown→HTML変換 */
function markdownToHtml(md: string): string {
  if (!md) return '';
  return marked.parse(md, { async: false }) as string;
}

/** HTML→Markdown変換 */
function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return '';
  return turndown.turndown(html);
}

interface RichTextEditorProps {
  /** Markdown形式の値 */
  value: string;
  /** Markdown形式で返す */
  onChange: (markdown: string) => void;
  /** プレースホルダーテキスト */
  placeholder?: string;
  /** エディタの最小高さ（CSSクラス） */
  className?: string;
}

/** ツールバーボタン */
const ToolbarButton: React.FC<{
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, isActive, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded transition-colors ${
      isActive
        ? 'bg-primary-100 text-primary-700'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
    }`}
  >
    {children}
  </button>
);

/** 区切り線 */
const Divider = () => <div className="w-px h-6 bg-slate-200 mx-1" />;

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = '記事の全文を入力してください',
  className,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(value),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const md = htmlToMarkdown(html);
      onChange(md);
    },
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none min-h-[10rem] px-3 py-2 text-sm text-slate-700 leading-relaxed',
      },
    },
  });

  // 外部からvalueが変わった場合（記事切り替え時）にエディタ内容を同期
  useEffect(() => {
    if (!editor) return;
    const currentMd = htmlToMarkdown(editor.getHTML());
    if (currentMd !== value) {
      editor.commands.setContent(markdownToHtml(value));
    }
  }, [value, editor]);

  /** リンク挿入 */
  const handleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('URLを入力してください:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={`border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent ${className || ''}`}>
      {/* ツールバー */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="太字"
        >
          <Bold size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="斜体"
        >
          <Italic size={16} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="見出し（大）"
        >
          <Heading2 size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="見出し（小）"
        >
          <Heading3 size={16} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="箇条書き"
        >
          <List size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="番号リスト"
        >
          <ListOrdered size={16} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={handleLink}
          isActive={editor.isActive('link')}
          title="リンク"
        >
          <LinkIcon size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="区切り線"
        >
          <Minus size={16} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="元に戻す"
        >
          <Undo2 size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="やり直す"
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </div>

      {/* エディタ本体 */}
      <EditorContent editor={editor} />
    </div>
  );
};
