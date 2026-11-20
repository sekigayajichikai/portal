# -*- coding: utf-8 -*-
"""
回答票の CSV（正解表／読み取り結果の確定版）から設問ごとの集計を出す。
使い方: python -I -X utf8 scripts/survey-test/tally.py "<票CSV>" "<設問一覧.md>" "<出力.md>" [地域]
- 票CSV の列: 票ID, q1..q16, 確認状態（任意）。q の値は "1,3,5" のようなカンマ区切り。"?" 付きは不確かな値として扱う
- 確認状態が「要確認」で q1〜q15 がすべて空の票は「読めない票」として件数だけ数える。確認状態「裏面」は用紙の裏が写ったページで、票として数えない
- 設問一覧.md の表から設問文と選択肢の文言を拾う
"""
import csv, io, re, sys

Q = [f"q{i}" for i in range(1, 17)]
MULTI = {"q1", "q6", "q9", "q14", "q15"}

def load_questions(path):
    qs = {}
    for line in io.open(path, encoding="utf-8"):
        m = re.match(r"\|\s*問(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$", line)
        if not m: continue
        n, text, kind, opts = m.groups()
        if n == "0": continue
        choices = {}
        for part in re.split(r"／", opts):
            mm = re.match(r"\s*(\d+)\s+(.+)", part)
            if mm: choices[int(mm.group(1))] = mm.group(2).strip()
        qs[f"q{n}"] = (text, kind, choices)
    return qs

def main():
    src, qpath, out = sys.argv[1], sys.argv[2], sys.argv[3]
    region = sys.argv[4] if len(sys.argv) > 4 else ""
    qs = load_questions(qpath)
    rows = list(csv.DictReader(io.open(src, encoding="utf-8-sig")))
    valid, unreadable, uncertain, backside = [], [], 0, []
    for r in rows:
        vals = {q: (r.get(q) or "").strip() for q in Q}
        # 確認状態「裏面」は用紙の裏が写ったページ。票ではないので数に入れない（2026-11-20 はなさん）
        if (r.get("確認状態") or "").strip() == "裏面":
            backside.append(r["票ID"]); continue
        if all(vals[q] == "" for q in Q[:15]):
            unreadable.append(r["票ID"]); continue
        if any("?" in vals[q] for q in Q[:15]): uncertain += 1
        valid.append((r["票ID"], vals, r.get("確認状態", ""), r.get("備考", "")))
    n = len(valid)
    lines = [f"# 集計（速報） {region}", "",
             f"- 元データ: `{src.split('/')[-1].split(chr(92))[-1]}`",
             f"- 有効票 {n}、読めない票 {len(unreadable)}（{', '.join(unreadable)}）、不確かな値を含む票 {uncertain}"
             + (f"、裏面のページ {len(backside)}（{', '.join(backside)}。票ではないので除外）" if backside else ""),
             "- 割合は有効票数に対する割合。複数回答の設問は合計が100%を超える", ""]
    for q in Q[:15]:
        text, kind, choices = qs.get(q, (q, "", {}))
        lines.append(f"## {q.replace('q','問')} {text}（{kind}）"); lines.append("")
        lines.append("| 選択肢 | 件数 | 割合 |"); lines.append("| --- | ---: | ---: |")
        counts = {k: 0 for k in choices}; blank = 0; invalid_multi = 0
        for _, vals, _, _ in valid:
            v = vals[q].replace("?", "")
            picks = [int(x) for x in v.split(",") if x.strip().isdigit()]
            if not picks: blank += 1; continue
            if q not in MULTI and len(picks) > 1: invalid_multi += 1
            for p in picks:
                counts[p] = counts.get(p, 0) + 1
        for k in sorted(counts):
            lines.append(f"| {k} {choices.get(k, '')} | {counts[k]} | {counts[k]*100/n:.0f}% |")
        lines.append(f"| （無回答） | {blank} | {blank*100/n:.0f}% |")
        if invalid_multi: lines.append(f"| （単一回答に2つ以上の印） | {invalid_multi} | |")
        lines.append("")
    lines.append("## 問16 自由記述"); lines.append("")
    free = [(sid, vals["q16"]) for sid, vals, _, _ in valid if vals["q16"]]
    if free:
        for sid, t in free: lines.append(f"- {t}（{sid}）")
    else:
        lines.append("- なし")
    lines.append("")
    io.open(out, "w", encoding="utf-8").write("\n".join(lines))
    print(f"有効票 {n} / 読めない票 {len(unreadable)} / 不確か {uncertain} → {out}")

main()
