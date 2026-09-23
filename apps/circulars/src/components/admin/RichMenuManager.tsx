/**
 * LINE リッチメニューの管理画面（管理画面「リッチメニュー」タブ）
 *
 * - メニューを作る（テンプレート／タイルの文言・行き先／色／タブ）→ 画像は自動生成（手持ちの画像に差し替えも可）
 * - LINE に登録（作成＋画像アップロード＋エイリアス）→ 自分だけに反映 → 全員の既定にする
 * - ユーザーIDを貼り付けて、特定の人にだけメニューを紐づける（登録済みの人／防災訓練の対象者）
 * - LINE 側に登録済みのメニュー一覧（既定の印つき）と削除
 *
 * 仕組み: docs/リッチメニュー.md。送信は Edge Function line-richmenu 経由（lineRichMenuService）
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  richMenuApi,
  getSavedRichMenus,
  saveRichMenu,
  deleteSavedRichMenu,
  uploadRichMenuImage,
  type SavedRichMenu,
  type LineRichMenu,
} from '@cc-saas/shared';
import { LayoutGrid, Loader2, Save, Upload, Trash2, Star, UserCheck, Users, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { showError, showToast, appConfirm } from '@/components/ui/feedback';
import {
  type RichMenuDef,
  type Tile,
  type MenuRole,
  ROLES,
  DEFAULT_COLORS,
  BOSAI_COLORS,
  PROMO_COLORS,
  SAMPLE_DEFS,
  TEMPLATES,
  renderRichMenu,
  buildRichMenuObject,
  canvasToUploadBlob,
  blobToBase64,
  RM_W,
  RM_H,
} from './richMenuImage';

const COLOR_PRESETS: Array<{ key: string; label: string; colors: RichMenuDef['colors'] }> = [
  { key: 'teal', label: '青緑（いまのメニュー）', colors: DEFAULT_COLORS },
  { key: 'promo', label: '深い青緑（登録促進）', colors: PROMO_COLORS },
  { key: 'bosai', label: '橙（防災訓練）', colors: BOSAI_COLORS },
];

const blankTile = (): Tile => ({ icon: '📌', label: '', action: { type: 'uri', uri: '' } });

function defForTemplate(template: RichMenuDef['template'], base?: RichMenuDef): RichMenuDef {
  const n = TEMPLATES.find((t) => t.key === template)!.tiles;
  const tiles = Array.from({ length: n }, (_, i) => base?.tiles[i] ?? blankTile());
  return { role: base?.role, name: base?.name ?? '新しいメニュー', chatBarText: base?.chatBarText ?? 'メニューを開く', template, colors: base?.colors ?? DEFAULT_COLORS, tabs: base?.tabs ?? null, tiles };
}

/** 保存行の役割（definition.role。無い旧データは名前から推定） */
function roleOf(m: SavedRichMenu): MenuRole | null {
  const r = (m.definition as RichMenuDef | null)?.role;
  if (r === 'normal' || r === 'promo' || r === 'bosai') return r;
  if (/登録促進/.test(m.name)) return 'promo';
  if (/防災/.test(m.name)) return 'bosai';
  if (/通常/.test(m.name)) return 'normal';
  return null;
}

export const RichMenuManager: React.FC = () => {
  const [saved, setSaved] = useState<SavedRichMenu[]>([]);
  const [lineMenus, setLineMenus] = useState<LineRichMenu[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  /** 既定が LINE公式アカウント管理画面（GUI）のメニューで、API からは読めない状態 */
  const [defaultManagedElsewhere, setDefaultManagedElsewhere] = useState(false);
  const [aliases, setAliases] = useState<Array<{ richMenuAliasId: string; richMenuId: string }>>([]);
  /** いま開いている役割タブ。役割ごとに保存メニューは1つ */
  const [role, setRole] = useState<MenuRole>('normal');
  const [current, setCurrent] = useState<SavedRichMenu | null>(null);
  const [def, setDef] = useState<RichMenuDef>(SAMPLE_DEFS.normal);
  /** 保存済み（またはサンプル）と比べるための基準。タブ移動時の未保存チェック用 */
  const [baseline, setBaseline] = useState<string>(JSON.stringify(SAMPLE_DEFS.normal));
  const [customImage, setCustomImage] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lineLoading, setLineLoading] = useState(false);
  const [userIds, setUserIds] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadSaved = () => getSavedRichMenus().then(setSaved);
  const loadLine = async () => {
    setLineLoading(true);
    try {
      const [list, d, al] = await Promise.all([richMenuApi('list'), richMenuApi('get_default'), richMenuApi('alias_list')]);
      setLineMenus(list.line?.richmenus ?? []);
      setDefaultId(d.line?.richMenuId ?? null);
      setDefaultManagedElsewhere(!!d.line?.managedElsewhere);
      setAliases(al.line?.aliases ?? []);
    } catch (e: any) {
      console.warn(e);
      showError(e?.message ?? 'LINE 側の一覧を取得できませんでした');
    } finally {
      setLineLoading(false);
    }
  };
  useEffect(() => {
    loadSaved();
    loadLine();
  }, []);

  // 定義が変わるたびに画像を描く（手持ち画像を選んでいるときはそれを表示）
  const preview = useMemo(() => renderRichMenu(def), [def]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = RM_W / 4;
    c.height = RM_H / 4;
    const ctx = c.getContext('2d')!;
    if (customImage) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = URL.createObjectURL(customImage);
    } else {
      ctx.drawImage(preview, 0, 0, c.width, c.height);
    }
  }, [preview, customImage]);

  const update = (patch: Partial<RichMenuDef>) => setDef((d) => ({ ...d, ...patch }));
  const updateTile = (i: number, patch: Partial<Tile>) => setDef((d) => ({ ...d, tiles: d.tiles.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  /** 役割ごとの保存行（同じ役割が複数あれば updated_at が新しいもの。saved は新しい順） */
  const savedFor = (r: MenuRole) => saved.find((m) => roleOf(m) === r) ?? null;

  /** タブ（役割）を開く: 保存行があればそれ、無ければサンプル */
  const openRole = (r: MenuRole, rows: SavedRichMenu[] = saved) => {
    const row = rows.find((m) => roleOf(m) === r) ?? null;
    const d: RichMenuDef = row ? { ...(row.definition as RichMenuDef), role: r } : SAMPLE_DEFS[r];
    setRole(r);
    setCurrent(row);
    setDef(d);
    setBaseline(JSON.stringify(d));
    setCustomImage(null);
  };
  const dirty = JSON.stringify(def) !== baseline || !!customImage;
  const switchRole = async (r: MenuRole) => {
    if (r === role) return;
    if (dirty && !(await appConfirm({ title: '保存していない変更があります', message: `「${ROLES.find((x) => x.key === role)?.label}」の変更を捨てて移動しますか？`, confirmLabel: '移動する' }))) return;
    openRole(r);
  };
  // 保存済み一覧を読み込んだら、開いているタブに保存行があれば差し替える（初回表示用）
  useEffect(() => {
    if (saved.length === 0) return;
    const row = savedFor(role);
    if (row && (!current || current.id !== row.id) && !dirty) openRole(role, saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  /** タブに出す状態バッジ */
  const roleBadge = (r: MenuRole): { label: string; cls: string } => {
    const row = savedFor(r);
    if (!row) return { label: '未作成', cls: 'bg-slate-100 text-slate-400' };
    if (!row.line_rich_menu_id) return { label: '保存済み', cls: 'bg-slate-100 text-slate-600' };
    if (defaultId && row.line_rich_menu_id === defaultId) return { label: '★ 既定', cls: 'bg-amber-100 text-amber-800' };
    return { label: 'LINE登録済み', cls: 'bg-emerald-50 text-emerald-700' };
  };

  /** 画像 Blob（手持ち画像があればそれ、無ければ生成） */
  const imageBlob = async (): Promise<Blob> => {
    if (customImage) {
      if (customImage.size > 1024 * 1024) throw new Error('画像は1MB以内にしてください');
      return customImage;
    }
    return canvasToUploadBlob(preview);
  };

  /** DB に保存（画像も Storage に置く） */
  const save = async (): Promise<SavedRichMenu> => {
    setBusy('save');
    try {
      const blob = await imageBlob();
      const key = (current?.id ?? `new-${Date.now()}`).toString();
      const image_url = await uploadRichMenuImage(blob, key);
      const definition: RichMenuDef = { ...def, role };
      const row = await saveRichMenu({ ...(current ? { id: current.id, line_rich_menu_id: current.line_rich_menu_id, alias_id: current.alias_id } : {}), name: def.name, definition, image_url });
      setCurrent(row);
      setDef(definition);
      setBaseline(JSON.stringify(definition));
      setCustomImage(null);
      await loadSaved();
      showToast('保存しました');
      return row;
    } finally {
      setBusy(null);
    }
  };

  /** LINE に登録（作成 → 画像 → エイリアス）。既に登録済みなら古いものを消して作り直す */
  const registerToLine = async (): Promise<SavedRichMenu> => {
    setBusy('register');
    try {
      const row = await save();
      const created = await richMenuApi<{ richMenuId: string }>('create', { menu: buildRichMenuObject(def) });
      const richMenuId = created.line.richMenuId;
      const blob = await imageBlob();
      await richMenuApi('upload_image', { richMenuId, contentType: blob.type, base64: await blobToBase64(blob) });
      // タブ付きなら自分のエイリアスをこの richMenuId に向ける
      const alias = def.tabs ? def.tabs.aliases[def.tabs.position] : null;
      if (alias) await richMenuApi('alias_set', { aliasId: alias, richMenuId });
      // 前に登録したものが既定だったら既定も付け替え、古いメニューは削除
      const old = row.line_rich_menu_id;
      if (old && old !== richMenuId) {
        if (defaultId === old) await richMenuApi('set_default', { richMenuId });
        await richMenuApi('delete', { richMenuId: old }).catch(() => undefined);
      }
      const updated = await saveRichMenu({ id: row.id, name: def.name, definition: def, image_url: row.image_url, line_rich_menu_id: richMenuId, alias_id: alias });
      setCurrent(updated);
      await Promise.all([loadSaved(), loadLine()]);
      showToast('LINE に登録しました。「自分だけに反映」で実機を確認してください');
      return updated;
    } catch (e: any) {
      showError(e?.message ?? 'LINE への登録に失敗しました');
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const withLine = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await loadLine();
    } catch (e: any) {
      showError(e?.message ?? '失敗しました');
    } finally {
      setBusy(null);
    }
  };

  const idList = userIds
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^U[0-9a-f]{32}$/.test(s));

  const lineId = current?.line_rich_menu_id ?? null;
  const tabPreview = def.tabs;

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <LayoutGrid size={20} className="text-teal-600" />
              リッチメニュー
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              公式LINEの下に出るメニューを3つの役割（通常／登録促進／防災訓練タブ）ごとに1つ作り、LINE に登録して「自分だけに反映」で確かめてから「全員の既定にする」か、特定の人にだけ紐づけます。
            </p>
          </div>
        </div>

        {/* 役割タブ（通常／登録促進／防災訓練タブ）。役割ごとに保存メニューは1つ。バッジで状態が分かる */}
        <div className="mt-4 border-b border-slate-200 flex gap-1">
          {ROLES.map((r) => {
            const badge = roleBadge(r.key);
            const active = role === r.key;
            return (
              <button
                key={r.key}
                onClick={() => switchRole(r.key)}
                title={r.hint}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                {r.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {ROLES.find((r) => r.key === role)?.hint}。{current ? '保存済みの内容を編集しています。' : 'まだ保存していません（サンプルが入っています）。'}
          {dirty && <span className="text-amber-700 font-bold ml-1">未保存の変更があります</span>}
        </p>

        <div className="grid gap-6 lg:grid-cols-2 mt-5">
          {/* エディタ */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                メニュー名（管理用）
                <input value={def.name} onChange={(e) => update({ name: e.target.value })} className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
              </label>
              <label className="text-xs text-slate-500">
                下のバーの文言（14文字まで）
                <input value={def.chatBarText} maxLength={14} onChange={(e) => update({ chatBarText: e.target.value })} className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
              </label>
              <label className="text-xs text-slate-500">
                レイアウト
                <select value={def.template} onChange={(e) => setDef(defForTemplate(e.target.value as RichMenuDef['template'], def))} className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5">
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                配色
                <select
                  value={COLOR_PRESETS.find((p) => p.colors === def.colors)?.key ?? 'custom'}
                  onChange={(e) => {
                    const p = COLOR_PRESETS.find((x) => x.key === e.target.value);
                    if (p) update({ colors: p.colors });
                  }}
                  className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5"
                >
                  {COLOR_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">（保存した配色）</option>
                </select>
              </label>
            </div>

            {/* タブ */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-2">
              <label className="flex items-center gap-2 font-bold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!def.tabs}
                  onChange={(e) => update({ tabs: e.target.checked ? { position: 0, labels: ['🏠 通常メニュー', '🚨 防災訓練'], aliases: ['menu-normal', 'menu-bosai'] } : null })}
                />
                上にタブを付ける（2つのメニューを切り替える）
              </label>
              {tabPreview && (
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1].map((i) => (
                    <div key={i} className={`rounded border px-2 py-1.5 ${tabPreview.position === i ? 'border-teal-400 bg-white' : 'border-slate-200'}`}>
                      <label className="flex items-center gap-1 text-slate-600">
                        <input type="radio" name="tabpos" checked={tabPreview.position === i} onChange={() => update({ tabs: { ...tabPreview, position: i as 0 | 1 } })} />
                        このメニューはタブ{i + 1}
                      </label>
                      <input
                        value={tabPreview.labels[i]}
                        onChange={(e) => {
                          const labels = [...tabPreview.labels] as [string, string];
                          labels[i] = e.target.value;
                          update({ tabs: { ...tabPreview, labels } });
                        }}
                        placeholder="タブの文言"
                        className="mt-1 w-full border border-slate-300 rounded px-1.5 py-1"
                      />
                      <input
                        value={tabPreview.aliases[i]}
                        onChange={(e) => {
                          const aliases = [...tabPreview.aliases] as [string, string];
                          aliases[i] = e.target.value.replace(/[^a-z0-9_-]/g, '');
                          update({ tabs: { ...tabPreview, aliases } });
                        }}
                        placeholder="エイリアスID（半角英数）"
                        className="mt-1 w-full border border-slate-300 rounded px-1.5 py-1 font-mono"
                        title="切替先のメニューの別名。もう一方のメニューでも同じIDを使う"
                      />
                    </div>
                  ))}
                  <p className="col-span-2 text-slate-500">
                    タブ切替は「通常」「防災訓練」の2つのメニューをそれぞれ登録し、同じエイリアスIDを使うと動きます。押した人にだけ切り替わります。
                  </p>
                </div>
              )}
            </div>

            {/* タイル */}
            <div className="space-y-2">
              {def.tiles.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-xs grid grid-cols-[3rem_1fr] gap-2 items-start">
                  <input value={t.icon} onChange={(e) => updateTile(i, { icon: e.target.value })} className="text-center text-lg border border-slate-300 rounded px-1 py-1" title="絵文字" />
                  <div className="space-y-1">
                    <input value={t.label} onChange={(e) => updateTile(i, { label: e.target.value })} placeholder={`タイル${i + 1}の文言（改行で2行）`} className="w-full border border-slate-300 rounded px-2 py-1" />
                    {def.template === 'promo' && i === 0 && (
                      <>
                        <input value={t.sub ?? ''} onChange={(e) => updateTile(i, { sub: e.target.value })} placeholder="説明（改行可）" className="w-full border border-slate-300 rounded px-2 py-1" />
                        <input value={t.button ?? ''} onChange={(e) => updateTile(i, { button: e.target.value })} placeholder="ボタン風の文言" className="w-full border border-slate-300 rounded px-2 py-1" />
                      </>
                    )}
                    <div className="flex gap-1.5">
                      <select
                        value={t.action.type}
                        onChange={(e) => {
                          const ty = e.target.value as Tile['action']['type'];
                          updateTile(i, { action: ty === 'uri' ? { type: 'uri', uri: '' } : ty === 'message' ? { type: 'message', text: '' } : { type: 'none' } });
                        }}
                        className="border border-slate-300 rounded px-1.5 py-1 shrink-0"
                      >
                        <option value="uri">URLを開く</option>
                        <option value="message">メッセージを送る</option>
                        <option value="none">押せない</option>
                      </select>
                      {t.action.type === 'uri' && (
                        <input value={t.action.uri} onChange={(e) => updateTile(i, { action: { type: 'uri', uri: e.target.value } })} placeholder="https://…" className="flex-1 border border-slate-300 rounded px-2 py-1 font-mono" />
                      )}
                      {t.action.type === 'message' && (
                        <input value={t.action.text} onChange={(e) => updateTile(i, { action: { type: 'message', text: e.target.value } })} placeholder="押したときにトークに送られる文" className="flex-1 border border-slate-300 rounded px-2 py-1" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* プレビューと操作 */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-500">画像（2500×1686・自動生成）</label>
                <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                  <ImageIcon size={14} />
                  手持ちの画像を使う
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => setCustomImage(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <canvas ref={canvasRef} className="w-full rounded-lg border border-slate-200" />
              {customImage && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {customImage.name}（{Math.round(customImage.size / 1024)}KB）を使います。タップ領域はレイアウトの設定どおり。{' '}
                  <button onClick={() => setCustomImage(null)} className="text-blue-600 hover:underline">
                    自動生成に戻す
                  </button>
                </p>
              )}
              <div className="mt-2 bg-[#c9a7e6] text-center text-xs py-1.5 rounded text-slate-700">{def.chatBarText || 'メニュー'} ▾</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => save().catch((e) => showError(e.message))} disabled={!!busy} className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50">
                {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
              </button>
              <button onClick={() => registerToLine().catch(() => undefined)} disabled={!!busy} className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {busy === 'register' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} LINE に登録
              </button>
              <button
                onClick={() => withLine('test', async () => { await richMenuApi('link_test', { richMenuId: lineId }); showToast('自分のLINEに反映しました。トーク画面を開き直して確認してください'); })}
                disabled={!!busy || !lineId}
                className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                title="LINE_TEST_USER_ID の自分にだけ紐づけます"
              >
                {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} 自分だけに反映
              </button>
              <button
                onClick={() => withLine('untest', async () => { await richMenuApi('unlink_test'); showToast('自分の紐づけを解除しました（既定に戻ります）'); })}
                disabled={!!busy}
                className="px-3 py-2 text-xs text-slate-600 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                自分の反映を解除
              </button>
              <button
                onClick={() => withLine('admins', async () => { const r = await richMenuApi('link_admins', { richMenuId: lineId }); showToast(`管理者 ${r.line?.linked ?? ''} 人に反映しました`); })}
                disabled={!!busy || !lineId}
                className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
                title="LINE_ADMIN_USER_IDS に登録した管理者（DX委員など）にだけ紐づけます"
              >
                {busy === 'admins' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} 管理者だけに反映
              </button>
              <button
                onClick={() => withLine('unadmins', async () => { const r = await richMenuApi('unlink_admins'); showToast(`管理者 ${r.line?.linked ?? ''} 人の紐づけを解除しました（既定に戻ります）`); })}
                disabled={!!busy}
                className="px-3 py-2 text-xs text-slate-600 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                管理者の反映を解除
              </button>
              <button
                onClick={async () => {
                  if (!lineId) return;
                  if (!(await appConfirm({ title: '友だち全員の既定メニューにしますか？', message: `「${def.name}」が、個別に紐づけていない全員に表示されます。`, confirmLabel: '全員の既定にする' }))) return;
                  await withLine('default', async () => { await richMenuApi('set_default', { richMenuId: lineId }); showToast('全員の既定メニューにしました'); });
                }}
                disabled={!!busy || !lineId}
                className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {busy === 'default' ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} 全員の既定にする
              </button>
            </div>
            {current && !lineId && <p className="text-[11px] text-amber-700">このメニューはまだ LINE に登録されていません。「LINE に登録」を押すと作成と画像アップロードを行います。</p>}
            {lineId && <p className="text-[11px] text-slate-400 font-mono">richMenuId: {lineId}{current?.alias_id ? ` ／ alias: ${current.alias_id}` : ''}</p>}

            {/* 特定の人に紐づけ */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-2">
              <p className="font-bold text-slate-600 flex items-center gap-1">
                <Users size={14} /> 特定の人にだけこのメニューを出す
              </p>
              <p className="text-slate-500">
                LINE のユーザーID（Uで始まる33文字）を改行かカンマ区切りで貼り付けてください。名簿のスプレッドシートのID列をそのままコピーできます。登録済みの人には通常メニュー、班長には防災訓練タブ、のように使います。
              </p>
              <textarea value={userIds} onChange={(e) => setUserIds(e.target.value)} rows={3} placeholder="Uxxxxxxxx…&#10;Uyyyyyyyy…" className="w-full border border-slate-300 rounded px-2 py-1 font-mono" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">{idList.length} 件の有効なID</span>
                <button
                  onClick={async () => {
                    if (!lineId || idList.length === 0) return;
                    if (!(await appConfirm({ title: `${idList.length} 人に「${def.name}」を紐づけますか？`, message: 'この人たちには既定ではなくこのメニューが表示されます。', confirmLabel: '紐づける' }))) return;
                    await withLine('link', async () => { const r = await richMenuApi('link_users', { richMenuId: lineId, userIds: idList }); showToast(`${r.line?.linked ?? idList.length} 人に紐づけました`); });
                  }}
                  disabled={!!busy || !lineId || idList.length === 0}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  このメニューに紐づける
                </button>
                <button
                  onClick={async () => {
                    if (idList.length === 0) return;
                    if (!(await appConfirm({ title: `${idList.length} 人の個別メニューを解除しますか？`, message: '既定のメニューに戻ります。', confirmLabel: '解除する' }))) return;
                    await withLine('unlink', async () => { await richMenuApi('unlink_users', { userIds: idList }); showToast('解除しました（既定に戻ります）'); });
                  }}
                  disabled={!!busy || idList.length === 0}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  紐づけを解除（既定に戻す）
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LINE 側の一覧 */}
      <div className="bg-white p-5 rounded-2xl shadow border border-slate-200 text-xs">
        {defaultManagedElsewhere && (
          <p className="mb-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            いまの全員の既定は、LINE公式アカウントの管理画面（GUI）で作ったメニューです。API からは読めません。ここで「全員の既定にする」を押すと、そちらより優先して表示されます。
          </p>
        )}
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-slate-600">LINE に登録されているメニュー（API で作ったもの）</p>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (!(await appConfirm({ title: '全員の既定メニューを解除しますか？', message: 'API の既定が無くなり、LINE公式アカウントの管理画面で作ったメニューが表示されます。', confirmLabel: '解除する' }))) return;
                await withLine('cleardefault', async () => { await richMenuApi('clear_default'); showToast('既定を解除しました'); });
              }}
              disabled={!!busy || !defaultId}
              className="text-slate-500 hover:text-red-600 disabled:opacity-40"
            >
              既定を解除
            </button>
            <button onClick={loadLine} className="flex items-center gap-1 text-slate-500 hover:text-slate-800">
              <RefreshCw size={12} /> 読み直す
            </button>
          </div>
        </div>
        {lineLoading ? (
          <p className="text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 取得中...</p>
        ) : lineMenus.length === 0 ? (
          <p className="text-slate-400">まだありません。LINE公式アカウントの管理画面で作ったメニューはここには出ません（API とは別管理）。</p>
        ) : (
          <ul className="space-y-1">
            {lineMenus.map((m) => {
              const al = aliases.filter((a) => a.richMenuId === m.richMenuId).map((a) => a.richMenuAliasId);
              const savedRow = saved.find((s) => s.line_rich_menu_id === m.richMenuId);
              return (
                <li key={m.richMenuId} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                  <span className={`px-1.5 py-0.5 rounded font-bold ${defaultId === m.richMenuId ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{defaultId === m.richMenuId ? '★ 既定' : '登録済み'}</span>
                  <span className="font-bold text-slate-700">{m.name}</span>
                  <span className="text-slate-400">{m.areas.length} 領域{al.length > 0 ? ` ／ alias: ${al.join(', ')}` : ''}{savedRow ? '' : '（この画面の保存なし）'}</span>
                  <span className="flex-1" />
                  <button
                    onClick={async () => {
                      if (!(await appConfirm({ title: `「${m.name}」を LINE から削除しますか？`, message: defaultId === m.richMenuId ? '既定のメニューです。削除すると既定が無くなります。' : '紐づけていた人は既定に戻ります。', confirmLabel: '削除する' }))) return;
                      await withLine('delete', async () => {
                        for (const a of al) await richMenuApi('alias_delete', { aliasId: a }).catch(() => undefined);
                        await richMenuApi('delete', { richMenuId: m.richMenuId });
                        if (savedRow) await saveRichMenu({ id: savedRow.id, name: savedRow.name, definition: savedRow.definition, image_url: savedRow.image_url, line_rich_menu_id: null, alias_id: null });
                        await loadSaved();
                        showToast('削除しました');
                      });
                    }}
                    className="text-slate-400 hover:text-red-600"
                    title="LINE から削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-slate-400 mt-2">
          優先順位: 個別に紐づけたメニュー ＞ ここで「全員の既定」にしたメニュー ＞ LINE公式アカウントの管理画面のメニュー。
        </p>
        {current && (
          <button
            onClick={async () => {
              if (!(await appConfirm({ title: `保存した「${current.name}」を削除しますか？`, message: 'この画面の保存だけを消します。LINE 側に登録済みなら先に上の一覧から削除してください。', confirmLabel: '削除する' }))) return;
              await deleteSavedRichMenu(current.id);
              // 削除後はこのタブをサンプル表示（未作成）に戻す
              const rows = await getSavedRichMenus();
              setSaved(rows);
              openRole(role, rows);
            }}
            className="mt-2 text-slate-400 hover:text-red-600"
          >
            保存した定義を削除
          </button>
        )}
      </div>
    </div>
  );
};
