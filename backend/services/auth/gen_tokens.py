import csv
import json

# Đọc users.json
with open("users.json", "r", encoding="utf-8") as f:
    users = json.load(f)

# Xuất ra tokens.csv
with open("tokens.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["username", "token"])  # Header

    for u in users:
        if u.get("token"):
            writer.writerow([u["username"], u["token"]])

print("Đã xuất thành công file tokens.csv!")