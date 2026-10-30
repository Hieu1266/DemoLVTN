"""Phân tích kết quả cân bằng tải từ file CSV của k6.

Cách dùng:
    k6 run --out csv=lb_run.csv ... lb_test.js
    python analyze_lb.py lb_run.csv [--bucket 10]
"""
import argparse
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--bucket", type=int, default=10, help="độ rộng khoảng thời gian (giây)")
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
        mix["% 503 (xả tải)"] = (100 * mix["503"] / mix["tổng"]).round(2)
    print(mix.to_string())

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


if __name__ == "__main__":
    main()