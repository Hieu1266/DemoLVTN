"""Phân tích kết quả cân bằng tải từ file CSV của k6.

Cách dùng:
    k6 run --out csv=lb_run.csv ... lb_test.js
    python analyze_lb.py lb_run.csv [--bucket 10]
"""
import argparse
import datetime as dt
import os
import sys
from urllib.parse import parse_qsl

import pandas as pd

REQ = "req_by_instance"
DELAYS = ["delay_exam_join", "delay_exam_draft", "delay_exam_submit", "delay_exam_result"]
WAIT = "gateway_wait_ms"
MON = ["gw_in_use", "gw_waiting", "gw_capacity", "inst_active"]
FLOW = ["flow_completed", "flow_stopped"]


def parse_tags(s):
    return dict(parse_qsl(s)) if isinstance(s, str) else {}


def load(path):
    keep = set([REQ, WAIT, *DELAYS, *MON, *FLOW])
    parts = []
    for chunk in pd.read_csv(
        path, usecols=["metric_name", "timestamp", "metric_value", "extra_tags"],
        chunksize=500_000, low_memory=False,
    ):
        chunk = chunk[chunk["metric_name"].isin(keep)]
        if not chunk.empty:
            parts.append(chunk)
    if not parts:
        sys.exit("Không thấy metric nào của lb_test.js trong file CSV. Đã chạy đúng script chưa?")
    df = pd.concat(parts, ignore_index=True)
    tags = df["extra_tags"].map(parse_tags).apply(pd.Series)
    df = pd.concat([df.drop(columns=["extra_tags"]), tags], axis=1)
    df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce")
    return df


def fairness(counts):
    x = counts.astype(float)
    n = len(x)
    cv = x.std(ddof=0) / x.mean() if x.mean() else float("nan")
    jain = (x.sum() ** 2) / (n * (x ** 2).sum()) if (x ** 2).sum() else float("nan")
    return cv, jain


def section(title):
    print("\n" + "=" * 78 + f"\n{title}\n" + "=" * 78)


def _fmt_ts(ts):
    if ts is None or pd.isna(ts):
        return ""
    return dt.datetime.fromtimestamp(float(ts)).strftime("%Y-%m-%d %H:%M:%S")


def _q(s, q):
    return round(float(s.quantile(q)), 1) if len(s) else ""


def _read_pods(path):
    """Đọc pods_<mã>.csv và phân loại pod theo lần lấy mẫu đầu tiên."""
    p = pd.read_csv(path, encoding="utf-8-sig")
    p["ready"] = p["ready"].astype(str).str.lower().eq("true")
    base = p["epoch"].min()
    rows = []
    for pod, g in p.groupby("pod"):
        ready_t = g.loc[g["ready"], "epoch"].min()
        first_seen = g["epoch"].min()
        if pd.isna(ready_t):
            kind = "KHONG_SAN_SANG"
        elif ready_t <= base:
            kind = "BAN_DAU"
        else:
            kind = "HPA_MOI"
        created = pd.to_datetime(g["created"].iloc[0], utc=True, errors="coerce")
        created_ts = created.timestamp() if pd.notna(created) else None
        rows.append({"pod": pod, "loai": kind, "ready_t": ready_t, "created_t": created_ts,
                     "first_seen": first_seen})
    return pd.DataFrame(rows)


def export_for_excel(args, df, req):
    """Xuất các file CSV để dán thẳng vào bang_thu_thap_can_bang_tai.xlsx."""
    run = args.run_id or os.path.splitext(os.path.basename(args.csv))[0]
    os.makedirs(args.export_dir, exist_ok=True)
    section(f"9. Xuất dữ liệu cho Excel (mã lần chạy: {run})")

    # ---- Ket_qua (một dòng; dán cột 2..15 vào D:Q của sheet Ket_qua)
    span = max(float(req["timestamp"].max() - req["timestamp"].min()), 1.0)
    total = int(req["metric_value"].sum())
    r503 = req[req["code"] == "503"]
    shed = int(r503[r503["inst"] == "none"]["metric_value"].sum())
    upst = int(r503[r503["inst"] != "none"]["metric_value"].sum())
    sub_fail = int(req[(req["step"] == "submit") & (req["code"] != "200")]["metric_value"].sum())
    done = int(df[df["metric_name"] == "flow_completed"]["metric_value"].sum())
    stop = int(df[df["metric_name"] == "flow_stopped"]["metric_value"].sum())
    d = lambda m: df[df["metric_name"] == m]["metric_value"]
    kq = pd.DataFrame([{
        "Mã lần chạy": run,
        "Tổng http_reqs": total,
        "Thông lượng (req/s)": round(total / span, 1),
        "Luồng hoàn thành": done,
        "Luồng dừng sớm": stop,
        "join p50 (ms)": _q(d("delay_exam_join"), .5),
        "join p95 (ms)": _q(d("delay_exam_join"), .95),
        "join p99 (ms)": _q(d("delay_exam_join"), .99),
        "draft p95 (ms)": _q(d("delay_exam_draft"), .95),
        "submit p95 (ms)": _q(d("delay_exam_submit"), .95),
        "submit p99 (ms)": _q(d("delay_exam_submit"), .99),
        "result p95 (ms)": _q(d("delay_exam_result"), .95),
        "503 do timeout upstream": upst,
        "503 do gateway xả tải": shed,
        "Số lần submit thất bại": sub_fail,
    }])
    p1 = os.path.join(args.export_dir, f"export_{run}_ket_qua.csv")
    kq.to_csv(p1, index=False, encoding="utf-8-sig")
    print(f"- {p1}")

    # ---- Theo_pod
    served = req[(req["inst"] != "none") & (req["code"].isin(["200", "201", "400"]))].copy()
    if "pod" in served and served["pod"].notna().any():
        served["key"] = served["pod"].fillna(served["inst"])
        key_note = "tên pod (từ header X-Pod-Name)"
    else:
        served["key"] = served["inst"]
        key_note = "instance (chưa có header X-Pod-Name nên không ra tên pod)"
    lat = df[df["metric_name"].isin(DELAYS)].copy()
    if "pod" in lat:
        lat["key"] = lat["pod"].fillna(lat.get("inst", ""))
    else:
        lat["key"] = lat.get("inst", "")
    per = served.groupby("key").agg(n=("metric_value", "sum"), first=("timestamp", "min"))
    p95 = lat.groupby("key")["metric_value"].quantile(.95).round(1)
    per["p95"] = p95.reindex(per.index)

    pods = _read_pods(args.pods) if args.pods else None
    if pods is not None:
        allkeys = sorted(set(per.index) | set(pods["pod"]))
        per = per.reindex(allkeys)
        per["n"] = per["n"].fillna(0).astype(int)
        info = pods.set_index("pod")
        per["loai"] = info["loai"].reindex(per.index).fillna("")
        per["ready"] = info["ready_t"].reindex(per.index)
    else:
        per["loai"] = ""
        per["ready"] = None
    tp = pd.DataFrame({
        "Mã lần chạy": run,
        "Tên pod / IP": per.index,
        "Loại pod": per["loai"].values,
        # Pod ban đầu đã sẵn sàng từ trước khi lấy mẫu nên không biết giờ chính xác -> để trống
        "Giờ pod sẵn sàng": [("" if k == "BAN_DAU" else _fmt_ts(x)) for k, x in zip(per["loai"], per["ready"])],
        "Giờ nhận request đầu": [_fmt_ts(x) for x in per["first"]],
        "Số request nhận": per["n"].astype(int).values,
        "p95 độ trễ (ms)": per["p95"].values,
    })
    p2 = os.path.join(args.export_dir, f"export_{run}_theo_pod.csv")
    tp.to_csv(p2, index=False, encoding="utf-8-sig")
    print(f"- {p2}  (khóa pod: {key_note})")
    if pods is None:
        print("  Chưa có --pods: cột 'Loại pod' và 'Giờ pod sẵn sàng' để trống, điền tay hoặc chạy lại với --pods.")

    # ---- Pod_moi (chỉ pod HPA tạo trong lúc chạy)
    if pods is not None:
        new = pods[pods["loai"] == "HPA_MOI"]
        rows = []
        for _, pr in new.iterrows():
            ev = served[served["key"] == pr["pod"]]
            first = ev["timestamp"].min() if len(ev) else None
            in30 = ev[(ev["timestamp"] >= pr["ready_t"]) & (ev["timestamp"] < pr["ready_t"] + 30)]
            rows.append({
                "Mã lần chạy": run, "Tên pod mới": pr["pod"],
                "Giờ pod được tạo": _fmt_ts(pr["created_t"]),
                "Giờ pod sẵn sàng": _fmt_ts(pr["ready_t"]),
                "Giờ nhận request đầu": _fmt_ts(first),
                "Số request đến hết test": int(ev["metric_value"].sum()),
                "Số request trong 30 giây đầu sau Ready": int(in30["metric_value"].sum()),
            })
        p3 = os.path.join(args.export_dir, f"export_{run}_pod_moi.csv")
        pd.DataFrame(rows, columns=["Mã lần chạy", "Tên pod mới", "Giờ pod được tạo", "Giờ pod sẵn sàng",
                                    "Giờ nhận request đầu", "Số request đến hết test",
                                    "Số request trong 30 giây đầu sau Ready"]).to_csv(
            p3, index=False, encoding="utf-8-sig")
        print(f"- {p3}  ({len(rows)} pod HPA_MOI)")

    # ---- Tai_nguyen (từ collect.ps1)
    if args.collect:
        c = pd.read_csv(args.collect, encoding="utf-8-sig")
        t0 = float(req["timestamp"].min())
        out = pd.DataFrame({
            "Mã lần chạy": run,
            "Giây kể từ lúc bắt đầu": (c["epoch"] - t0).round(0).astype(int),
            "Số pod exam (HPA)": c["hpa_current"],
            "Số pod exam Ready": c["exam_ready"],
            "Số pod gateway": c["gateway_pods"],
            "CPU node (%)": c["node_cpu_pct"],
            "RAM node (%)": c["node_mem_pct"],
            "CPU trung bình pod exam (m)": c["exam_cpu_m_avg"],
            "Postgres: idle in transaction": c["pg_idle_in_tx"],
            "Postgres: active": c["pg_active"],
        })
        p4 = os.path.join(args.export_dir, f"export_{run}_tai_nguyen.csv")
        out.to_csv(p4, index=False, encoding="utf-8-sig")
        print(f"- {p4}  (giây âm = lấy mẫu trước khi k6 bắt đầu)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--bucket", type=int, default=10, help="độ rộng khoảng thời gian (giây)")
    ap.add_argument("--run-id", default=None, help="mã lần chạy (mặc định: tên file CSV)")
    ap.add_argument("--pods", default=None, help="file pods_<mã>.csv do collect.ps1 tạo")
    ap.add_argument("--collect", default=None, help="file collect_<mã>.csv do collect.ps1 tạo")
    ap.add_argument("--export-dir", default=".", help="thư mục ghi các file export_*.csv")
    args = ap.parse_args()

    df = load(args.csv)
    t0 = df["timestamp"].min()
    df["t"] = df["timestamp"] - t0

    req = df[df["metric_name"] == REQ].copy()
    for col in ("inst", "code", "step"):
        if col not in req:
            req[col] = ""
    req["inst"] = req["inst"].fillna("none")

    # 1. Trạng thái trả về theo bước
    section("1. Mã trạng thái theo bước (số request)")
    mix = req.pivot_table(index="step", columns="code", values="metric_value",
                          aggfunc="sum", fill_value=0)
    mix = mix.astype(int)
    mix["tổng"] = mix.sum(axis=1)
    if "503" in mix:
        r503 = req[req["code"] == "503"]
        shed = r503[r503["inst"] == "none"].groupby("step")["metric_value"].sum()
        upst = r503[r503["inst"] != "none"].groupby("step")["metric_value"].sum()
        mix["503 xả tải"] = shed.reindex(mix.index).fillna(0).astype(int)
        mix["503 timeout/lỗi upstream"] = upst.reindex(mix.index).fillna(0).astype(int)
        mix["% 503 tổng"] = (100 * mix["503"] / mix["tổng"]).round(2)
    print(mix.to_string())
    print("(503 xả tải = gateway từ chối ngay, không có header instance; "
          "503 timeout = đã chuyển tiếp nhưng pod không trả lời kịp.)")

    # 2. Phân phối giữa các instance (chỉ request thật sự được chuyển tiếp)
    section("2. Phân phối request giữa các instance")
    served = req[(req["inst"] != "none") & (req["code"].isin(["200", "201", "400"]))]
    if served.empty:
        print("Không có request nào được gateway chuyển tiếp (hoặc thiếu header x-gateway-instance).")
    else:
        for step, grp in [("TẤT CẢ", served)] + list(served.groupby("step")):
            counts = grp.groupby("inst")["metric_value"].sum().sort_values(ascending=False)
            share = (100 * counts / counts.sum()).round(2)
            out = pd.DataFrame({"requests": counts.astype(int), "tỉ lệ %": share})
            print(f"\n-- {step}")
            print(out.to_string())
            if len(counts) > 1:
                cv, jain = fairness(counts)
                print(f"   Hệ số biến thiên (CV): {cv:.3f}   |   Chỉ số Jain: {jain:.3f}   (1.0 = đều tuyệt đối)")
            else:
                print("   Chỉ thấy 1 instance: gateway đang trỏ tới Service (kube-proxy chia tiếp ở dưới) "
                      "hoặc chỉ có 1 bản sao.")

        pods = served[served.get("pod").notna()] if "pod" in served else served.iloc[0:0]
        if not pods.empty:
            counts = pods.groupby("pod")["metric_value"].sum()
            cv, jain = fairness(counts)
            print(f"\n-- Theo POD (từ header X-Pod-Name): {len(counts)} pod, CV={cv:.3f}, Jain={jain:.3f}")
            print(counts.astype(int).sort_values(ascending=False).to_string())

    # 3. Độ trễ theo instance
    section("3. Độ trễ theo instance (ms)")
    lat = df[df["metric_name"].isin(DELAYS)].copy()
    if "inst" in lat and not lat.empty:
        lat = lat[lat["inst"].notna() & (lat["inst"] != "none")]
        g = lat.groupby(["metric_name", "inst"])["metric_value"]
        table = g.agg(n="count", p50=lambda s: s.quantile(.5),
                      p95=lambda s: s.quantile(.95), p99=lambda s: s.quantile(.99)).round(1)
        print(table.to_string())
    else:
        print("Không có dữ liệu độ trễ gắn với instance.")

    # 4. Thời gian chờ trong hàng đợi gateway
    section("4. Thời gian chờ trong hàng đợi gateway (ms)")
    w = df[df["metric_name"] == WAIT]["metric_value"]
    if w.empty:
        print("Không có header x-gateway-wait-seconds.")
    else:
        print(f"n={len(w)}  p50={w.quantile(.5):.0f}  p95={w.quantile(.95):.0f}  max={w.max():.0f}")

    # 5. Pod/instance mới bắt đầu nhận tải khi nào
    section("5. Lần đầu mỗi instance nhận request (giây kể từ khi bắt đầu)")
    if not served.empty:
        first = served.groupby("inst")["t"].min().sort_values().round(1)
        print(first.to_string())
        print("(Instance xuất hiện muộn = pod mới sinh ra do autoscaling; hiệu số với lúc pod "
              "sẵn sàng cho biết gateway dùng pod mới chậm bao lâu.)")

    # 6. Chuỗi thời gian
    section(f"6. Chuỗi thời gian (mỗi {args.bucket}s) -> lb_timeseries.csv")
    if not served.empty:
        served = served.assign(bucket=(served["t"] // args.bucket * args.bucket).astype(int))
        ts = served.pivot_table(index="bucket", columns="inst", values="metric_value",
                                aggfunc="sum", fill_value=0)
        ts.to_csv("lb_timeseries.csv")
        print(ts.tail(8).to_string())
        print(f"... đã lưu {len(ts)} dòng vào lb_timeseries.csv (dùng để vẽ biểu đồ)")

    # 7. Trạng thái hàng đợi gateway
    section("7. Trạng thái hàng đợi gateway (lấy từ /debug/state)")
    mon = df[df["metric_name"].isin(MON)]
    if mon.empty:
        print("Không có dữ liệu monitor.")
    else:
        key = [c for c in ("svc", "inst") if c in mon]
        print(mon.groupby(["metric_name", *key], dropna=False)["metric_value"]
                 .agg(trung_bình="mean", lớn_nhất="max").round(2).to_string())

    # 8. Luồng hoàn thành / dừng
    section("8. Luồng thi")
    done = df[df["metric_name"] == "flow_completed"]["metric_value"].sum()
    stopped = df[df["metric_name"] == "flow_stopped"]
    print(f"Hoàn thành đủ 4 bước: {int(done)}")
    if not stopped.empty:
        s = stopped.groupby(["at", "reason"])["metric_value"].sum().astype(int)
        print("Dừng sớm:\n" + s.to_string())

    export_for_excel(args, df, req)


if __name__ == "__main__":
    main()