<#
Đếm request mỗi pod từ log truy cập (uvicorn) để đo phân phối tải mà không cần header từ gateway.

Cách dùng (chạy NGAY sau khi k6 kết thúc, trước khi HPA giảm pod):
    .\pod_load.ps1                                   # exam-service, 10 phút gần nhất
    .\pod_load.ps1 -Label app=api-gateway -Pattern "/api/v1/"
    .\pod_load.ps1 -Since 30m -Pattern "/attempts/join"

Lưu ý: pod đã bị xóa (scale xuống) thì mất log; số liệu chỉ gồm pod còn tồn tại.
#>
param(
    [string]$Namespace = "ssl",
    [string]$Label = "app=exam-service",
    [string]$Since = "10m",
    [string]$Pattern = "/attempts/"
)

function Parse-K8sTime([string]$s) {
    if (-not $s) { return $null }
    $t = $s -replace '(\.\d{6})\d+Z$', '$1Z'   # .NET chỉ nhận tối đa 7 chữ số lẻ
    return [datetime]::Parse(
        $t,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    ).ToUniversalTime()
}

$podsJson = kubectl get pods -n $Namespace -l $Label -o json | ConvertFrom-Json
if (-not $podsJson.items -or @($podsJson.items).Count -eq 0) {
    Write-Host "Không tìm thấy pod nào với nhãn $Label trong namespace $Namespace"
    exit 1
}

$rows = @()
foreach ($p in $podsJson.items) {
    $name = $p.metadata.name
    $ready = $p.status.conditions | Where-Object { $_.type -eq "Ready" -and $_.status -eq "True" } | Select-Object -First 1
    $readyAt = $null
    if ($ready) { $readyAt = Parse-K8sTime $ready.lastTransitionTime }

    # @() để khi không có dòng nào thì ra mảng rỗng (Count = 0), không phải $null
    $lines = @(kubectl logs -n $Namespace $name --since=$Since --timestamps 2>$null |
        Where-Object { $_ -like "*$Pattern*" })
    $count = $lines.Count

    $firstAt = $null
    $delay = $null
    if ($count -gt 0) {
        $firstAt = Parse-K8sTime (($lines[0] -split ' ', 2)[0])
        if ($readyAt) { $delay = [math]::Round(($firstAt - $readyAt).TotalSeconds, 1) }
    }

    $rows += [pscustomobject]@{
        Pod           = $name
        SanSangLuc    = if ($readyAt) { $readyAt.ToString("HH:mm:ss") } else { "-" }
        Requests      = $count
        NhanDauTienLuc = if ($firstAt) { $firstAt.ToString("HH:mm:ss") } else { "-" }
        TreSauKhiSanSang_s = $delay
    }
}

$total = ($rows | Measure-Object -Property Requests -Sum).Sum
foreach ($r in $rows) {
    $share = 0
    if ($total -gt 0) { $share = [math]::Round(100.0 * $r.Requests / $total, 2) }
    $r | Add-Member -NotePropertyName "TiLe_%" -NotePropertyValue $share
}

Write-Host ""
Write-Host "Nhãn: $Label | mẫu lọc: '$Pattern' | khoảng: $Since"
$rows | Sort-Object Requests -Descending |
    Format-Table Pod, SanSangLuc, Requests, "TiLe_%", NhanDauTienLuc, TreSauKhiSanSang_s -AutoSize

$counts = @($rows | ForEach-Object { [double]$_.Requests })
if ($total -gt 0 -and $counts.Count -gt 1) {
    $mean = $total / $counts.Count
    $var = ($counts | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Sum).Sum / $counts.Count
    $cv = [math]::Sqrt($var) / $mean
    $sq = ($counts | ForEach-Object { $_ * $_ } | Measure-Object -Sum).Sum
    $jain = ($total * $total) / ($counts.Count * $sq)
    Write-Host ("Số pod: {0} | Tổng request: {1} | CV = {2:N3} | Jain = {3:N3} (1.0 = đều tuyệt đối)" -f $counts.Count, $total, $cv, $jain)
} elseif ($counts.Count -le 1) {
    Write-Host "Chỉ có 1 pod nên chưa có gì để so sánh phân phối."
} else {
    Write-Host "Không có request nào khớp mẫu lọc trong khoảng thời gian này."
}