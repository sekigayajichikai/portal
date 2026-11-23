# -*- coding: utf-8 -*-
"""
試し読みの結果（results/<label>.json）を正解表（試し読み_正解表.csv）と突き合わせる。
使い方: python -I scripts/survey-test/compare.py "<正解表.csv>" "<results/label.json>" [...]
- 設問ごとに一致／不一致を数え、不一致の中身と confidence を表示する
- 正解表の「?」付きや空（要確認で未記入）の設問は比較から外す
"""
import csv, json, sys, io

Q = [f"q{i}" for i in range(1, 17)]

def parse_truth(path):
    truth = {}
    with io.open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            t = {}
            for q in Q:
                v = (row.get(q) or "").strip()
                if q == "q16":
                    t[q] = v if v else ""
                    continue
                if "?" in v:
                    t[q] = None  # 比較対象外
                else:
                    t[q] = sorted(int(x) for x in v.split(",") if x.strip())
            truth[row["票ID"]] = (t, row.get("確認状態", ""), row.get("備考", ""))
    return truth

def main():
    truth = parse_truth(sys.argv[1])
    for rpath in sys.argv[2:]:
        d = json.load(io.open(rpath, encoding="utf-8"))
        print(f"\n=== {d['label']} ({d['model']}) ===")
        n_q = n_ok = n_skip = 0
        n_sheet = n_sheet_ok = 0
        flagged_wrong = 0; unflagged_wrong = 0
        for r in d["results"]:
            sid = r["sheet"]
            if r.get("error") or not r.get("result"):
                print(f"{sid}: エラー {str(r.get('error'))[:80]}")
                continue
            if sid not in truth:
                print(f"{sid}: 正解表に無い"); continue
            t, state, note = truth[sid]
            a = r["result"]["answers"]; c = r["result"].get("confidence", {})
            if state == "要確認" and all(v in (None, [], "") for v in t.values()):
                print(f"{sid}: 正解表が未記入（{note[:40]}）→ AI: flags={r['result'].get('flags')} low={[k for k,v in c.items() if v=='low']}")
                continue
            n_sheet += 1; wrong = []
            for q in Q:
                tv = t[q]
                if tv is None: n_skip += 1; continue
                if q == "q16":
                    av = (a.get("q16") or "").strip()
                    ok = (av == "") == (tv == "")
                else:
                    av = sorted(int(x) for x in (a.get(q) or []))
                    ok = av == tv
                n_q += 1
                if ok: n_ok += 1
                else:
                    wrong.append(f"{q}: 正解{tv} / AI{av} ({c.get(q,'-')})")
                    if c.get(q, "high") != "high": flagged_wrong += 1
                    else: unflagged_wrong += 1
            if not wrong: n_sheet_ok += 1
            print(f"{sid}: {'一致' if not wrong else '不一致 ' + str(len(wrong))}  low/mid={[k for k,v in c.items() if v!='high']} flags={r['result'].get('flags')}")
            for w in wrong: print("    " + w)
        print(f"設問単位: {n_ok}/{n_q} 一致（比較対象外 {n_skip}）  票単位: {n_sheet_ok}/{n_sheet} 全問一致")
        print(f"不一致のうち AI が high のまま（見逃し）: {unflagged_wrong} ／ mid/low が付いていた: {flagged_wrong}")
        u = d.get("usage_total", {})
        print(f"tokens: in {u.get('input')} / out {u.get('output')} / think {u.get('thinking')}")

main()
