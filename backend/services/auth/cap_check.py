#!/usr/bin/env python3
"""Danh gia ket qua test bac thang va tim "vien gach" cua 1 pod exam.

Doc: export/export_<TAG>-V<vu>-<lan>_ket_qua.csv va _tai_nguyen.csv (do analyze_lb.py xuat).

Mot lan chay HOP LE khi (cua so giu tai):
  - CPU node toi da <= --cpu-max (mac dinh 70)
  - Postgres active toi da < --pg-max (mac dinh 40)
  - so pod exam Ready luon = 1 (khong co pod moi, khong restart/Pending)
Mot lan chay DAT khi:
  - join p95 <= 2000ms, submit p95 <= --p95 (mac dinh 1500ms)
  - 503 = 0, submit that bai = 0
Vien gach = RPS trung binh o bac cao nhat con (hop le + dat), tinh truoc bac dau tien that bai.
Dung --pods N khi test voi N pod exam (mac dinh 1).
"""
import argparse
import csv
import glob
import os
import re
import statistics
import sys


def read_rows(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.reader(f))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load_run(export_dir, run_id, ramp, hold, pods=1):
    kq = read_rows(os.path.join(export_dir, f"export_{run_id}_ket_qua.csv"))
    if len(kq) < 2:
        return None
    k = kq[1]
    out = {
        "run": run_id,
        "rps": num(k[2]),
        "join_p95": num(k[6]),
        "submit_p95": num(k[9]),
        "err": (num(k[12]) or 0) + (num(k[13]) or 0) + (num(k[14]) or 0),
        "node_cpu": None, "pod_cpu": None, "pg_active": None, "pods_ok": None,
    }
    tn_path = os.path.join(export_dir, f"export_{run_id}_tai_nguyen.csv")
    if os.path.exists(tn_path):
        rows = [r for r in read_rows(tn_path)[1:] if len(r) >= 10]
        steady = [r for r in rows if num(r[1]) is not None and ramp <= num(r[1]) <= ramp + hold]
        if steady:
            cpu = [num(r[5]) for r in steady if num(r[5]) is not None]
            pod = [num(r[7]) for r in steady if num(r[7]) is not None]
            pg = [num(r[9]) for r in steady if num(r[9]) is not None]
            out["node_cpu"] = max(cpu) if cpu else None
            out["pod_cpu"] = statistics.mean(pod) if pod else None
            out["pg_active"] = max(pg) if pg else None
            # cot 2 (hpa_current) rong khi da xoa HPA nen chi xet cot 3: so pod exam Ready phai luon = 1
            out["pods_ok"] = all(num(r[3]) == pods for r in steady)
    return out


def judge(r, a):
    """Tra ve (hop_le, dat, ly_do)"""
    reasons = []
    valid = True
    if r["node_cpu"] is not None and r["node_cpu"] > a.cpu_max:
        valid = False; reasons.append(f"CPU node {r['node_cpu']:.0f}%")
    if r["pg_active"] is not None and r["pg_active"] >= a.pg_max:
        valid = False; reasons.append(f"PG active {r['pg_active']:.0f}")
    if r["pods_ok"] is False:
        valid = False; reasons.append(f"so pod exam Ready != {a.pods}")
    if r["node_cpu"] is None:
        reasons.append("thieu du lieu tai nguyen")
    ok = (
        r["join_p95"] is not None and r["join_p95"] <= 2000
        and r["submit_p95"] is not None and r["submit_p95"] <= a.p95
        and r["err"] == 0
    )
    if not ok:
        bits = []
        if r["submit_p95"] is not None and r["submit_p95"] > a.p95: bits.append(f"submit p95 {r['submit_p95']:.0f}ms")
        if r["join_p95"] is not None and r["join_p95"] > 2000: bits.append(f"join p95 {r['join_p95']:.0f}ms")
        if r["err"]: bits.append(f"{r['err']:.0f} loi/503")
        reasons.append("khong dat: " + ", ".join(bits))
    return valid, ok, "; ".join(reasons)


def fmt(v, d=0):
    return "-" if v is None else f"{v:.{d}f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="CAP")
    ap.add_argument("--export-dir", default="export")
    ap.add_argument("--vus", type=int, default=None, help="chi danh gia 1 bac (dung voi --gate)")
    ap.add_argument("--gate", action="store_true", help="exit 1 neu bac --vus khong (hop le + dat)")
    ap.add_argument("--ramp", type=int, default=30)
    ap.add_argument("--hold", type=int, default=120)
    ap.add_argument("--pods", type=int, default=1, help="so pod exam dang chay (Ready) trong lan test nay")
    ap.add_argument("--p95", type=float, default=1500)
    ap.add_argument("--cpu-max", type=float, default=70)
    ap.add_argument("--pg-max", type=float, default=40)
    a = ap.parse_args()

    pat = re.compile(rf"^{re.escape(a.tag)}-V(\d+)-(\d+)$")
    steps = {}
    for p in glob.glob(os.path.join(a.export_dir, f"export_{a.tag}-V*-*_ket_qua.csv")):
        rid = os.path.basename(p)[len("export_"):-len("_ket_qua.csv")]
        m = pat.match(rid)
        if not m:
            continue
        vu = int(m.group(1))
        if a.vus is not None and vu != a.vus:
            continue
        r = load_run(a.export_dir, rid, a.ramp, a.hold, a.pods)
        if r:
            steps.setdefault(vu, []).append(r)

    if not steps:
        print("Khong tim thay du lieu export phu hop.")
        sys.exit(2)

    print(f"{'VU':>5} {'lan':>3} {'RPS':>7} {'join p95':>9} {'sub p95':>8} {'loi':>4} {'CPUnode':>8} {'CPUpod(m)':>9} {'PGact':>6}  ket luan")
    summary = []
    for vu in sorted(steps):
        runs = sorted(steps[vu], key=lambda x: x["run"])
        verdicts = []
        for r in runs:
            valid, ok, why = judge(r, a)
            verdicts.append((valid, ok))
            tag = ("HOP LE" if valid else "KHONG HOP LE") + (" / DAT" if ok else " / KHONG DAT")
            print(f"{vu:>5} {r['run'].rsplit('-', 1)[1]:>3} {fmt(r['rps'], 1):>7} {fmt(r['join_p95']):>9} {fmt(r['submit_p95']):>8} "
                  f"{fmt(r['err']):>4} {fmt(r['node_cpu']):>7}% {fmt(r['pod_cpu']):>9} {fmt(r['pg_active']):>6}  {tag}" + (f"  [{why}]" if why else ""))
        all_valid = all(v for v, _ in verdicts)
        all_ok = all(o for _, o in verdicts)
        rps = statistics.mean([r["rps"] for r in runs if r["rps"] is not None])
        podcpu = [r["pod_cpu"] for r in runs if r["pod_cpu"] is not None]
        summary.append((vu, all_valid, all_ok, rps, statistics.mean(podcpu) if podcpu else None, len(runs)))

    if a.gate:
        vu, v, o, *_ = summary[0]
        sys.exit(0 if (v and o) else 1)

    print("\n--- TONG HOP THEO BAC ---")
    brick = None
    stop_reason = None
    for vu, v, o, rps, pc, n in summary:
        status = "OK" if (v and o) else ("GIOI HAN DO MAY/DB" if not v else "PHA VO NGUONG")
        print(f"{vu:>5} VU ({n} lan): RPS TB {rps:.1f}, CPU pod TB {fmt(pc)}m -> {status}")
        if stop_reason is None:
            if v and o:
                brick = (vu, rps, pc)  # cap nhat lien tuc -> giu bac cao nhat con dat
            else:
                stop_reason = (vu, "may/DB gioi han truoc (so do khong phai cua pod)" if not v else "pod dat diem gay")
    print()
    if brick:
        print(f"VIEN GACH: 1 pod exam chiu duoc ~{brick[1]:.0f} req/s (bac {brick[0]} VU), CPU pod TB {fmt(brick[2])}m, p95 trong nguong.")
    else:
        print("Chua co bac nao dat + hop le. Giam --Steps (bat dau thap hon) hoac xem cot ly do.")
    if stop_reason:
        print(f"Dung o bac {stop_reason[0]} VU: {stop_reason[1]}.")
        if "may/DB" in stop_reason[1]:
            print("=> Chua do duoc gioi han cua pod. Giam tai k6 chung may / nang pool DB / tach k6 sang may khac roi do lai.")


if __name__ == "__main__":
    main()