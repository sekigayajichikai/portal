/**
 * WYSIWYGリッチテキストエディタ
 *
 * Tiptapベース。Markdownを知らない人でもWordのように編集できる。
 * 内部的にはMarkdown形式で入出力する（保存時の互換性を維持）。
 */

import { appPrompt } from '@/components/ui/feedback';
import React, { useCallback, useEffect, useRef } from 'react';
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

/**
 * Markdownテーブルをプレースホルダーに置換して保護する。
 * Tiptapはテーブルを理解できないため、読み込み時に壊れてしまう。
 * テーブル部分を退避し、保存時に復元する。
 *
 * 退避先は**コンポーネントごとに持つ**（tablesRef）。以前はモジュール変数に置いていたため、
 * 記事を切り替えたり画面が描き直されたりすると中身が入れ替わり、
 * 復元できずに表が丸ごと消える事故が起きた（2026-09-28。10月号「ふれあいの会10月の予定」）。
 */
const TABLE_REGEX = /((?:^|\n)\|.+\|[ \t]*\n\|[\s\-:|]+\|[ \t]*\n(?:\|.+\|[ \t]*\n?)+)/g;
/**
 * 目印には **アンダースコアを使わない**。turndown が `_` を `\_` にエスケープするため、
 * 旧形式 `@@TABLE_0@@` は戻すときの照合に失敗し、表が復元されないまま保存されていた（2026-09-28の事故の原因）。
 */
const TABLE_PLACEHOLDER_PREFIX = '@@TABLE';
/** 目印の照合。旧形式（`@@TABLE_0@@`）とエスケープ後（`@@TABLE\_0@@`）も拾う */
const TABLE_PLACEHOLDER_PATTERN = '@@TABLE\\\\?_?(\\d+)@@';

function extractTables(md: string): { cleaned: string; tables: string[] } {
  const tables: string[] = [];
  const cleaned = md.replace(TABLE_REGEX, (match) => {
    const idx = tables.length;
    tables.push(match.trim());
    return `\n\n${TABLE_PLACEHOLDER_PREFIX}${idx}@@\n\n`;
  });
  return { cleaned, tables };
}

/**
 * プレースホルダーを表に戻す。
 * 対応する表が見つからないときは**プレースホルダーをそのまま残す**（空にして消さない）。
 * 消すと本文から表が失われて復旧できなくなるため、目印を残して気づけるようにする。
 */
function restoreTables(md: string, tables: string[]): string {
  return md.replace(new RegExp(TABLE_PLACEHOLDER_PATTERN, 'g'), (whole, idx) => {
    const table = tables[Number(idx)];
    if (table === undefined) {
      console.warn('[RichTextEditor] 表を復元できませんでした。プレースホルダーを残します:', whole);
      return whole;
    }
    return table;
  });
}

/** Markdown→HTML変換（テーブルを退避し、退避した表も返す）。検証用に export している */
export function markdownToHtml(md: string): { html: string; tables: string[] } {
  if (!md) return { html: '', tables: [] };
  const { cleaned, tables } = extractTables(md);
  return { html: marked.parse(cleaned, { async: false }) as string, tables };
}

/** HTML→Markdown変換（プレースホルダーをテーブルに復元）。検証用に export している */
export function htmlToMarkdown(html: string, tables: string[]): string {
  if (!html || html === '<p></p>') return '';
  const md = turndown.turndown(html);
  return restoreTables(md, tables);
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
  /** いま編集している本文から退避した表。コンポーネントごとに持つ（記事をまたいで混ざらないように） */
  const tablesRef = useRef<string[]>([]);
  /** Markdown → HTML。退避した表を ref に控える */
  const toHtml = useCallback((md: string) => {
    const { html, tables } = markdownToHtml(md);
    tablesRef.current = tables;
    return html;
  }, []);
  /** HTML → Markdown。控えておいた表を戻す */
  const toMarkdown = useCallback((html: string) => htmlToMarkdown(html, tablesRef.current), []);

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
    content: toHtml(value),
    onUpdate: ({ editor }) => {
      onChange(toMarkdown(editor.getHTML()));
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
    const currentMd = toMarkdown(editor.getHTML());
    if (currentMd !== value) {
      editor.commands.setContent(toHtml(value));
    }
  }, [value, editor, toHtml, toMarkdown]);

  /** 表を含む本文か（編集欄の下に注意書きを出す） */
  const tableCount = tablesRef.current.length;

  /** リンク挿入 */
  const handleLink = useCallback(async () => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = await appPrompt({
      title: 'リンク先のURLを入力',
      placeholder: 'https://…',
      confirmLabel: 'リンクを挿入',
    });
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

      {/* 表を含む本文の注意書き（この編集欄は表を編集できないため、目印で位置だけ示している） */}
      {tableCount > 0 && (
        <p className="px-3 py-1.5 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-200">
          この記事には表が {tableCount} 個あります。本文の <code className="font-mono">@@TABLE0@@</code> は表の位置を示す目印で、保存すると元の表に戻ります。
          <strong>目印の行を消すと表も消えます。</strong>表そのものを直すときは、いったん保存してから担当者に相談してください。
        </p>
      )}
    </div>
  );
};
