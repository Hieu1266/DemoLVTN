<#
.SYNOPSIS
  Lay mau trang thai cluster trong luc chay k6 (chay o mot cua so PowerShell rieng).

.DESCRIPTION
  Ghi hai file:
    collect_<RunId>.csv : so pod, HPA, CPU/RAM node, CPU pod exam, ket noi Postgres theo thoi gian
    pods_<RunId>.csv    : trang thai Ready cua tung pod exam theo thoi gian (gio cua may ban)

  Cach dung (mo cua so PowerShell thu hai TRUOC khi chay k6):
    .\collect.ps1 -RunId P2C-100-1 -Seconds 200
  Sau do chay k6 o cua so thu nhat. Thoi gian lay mau = Seconds (nen lon hon thoi gian chay k6 khoang 60 giay).

  Moi vong lay mau goi vai lenh kubectl nen khoang cach thuc te thuong la 6 den 10 giay.
#>
param(
    [string]$RunId = "run",
    [string]$Namespace = "ssl",
    [int]$Interval = 5,
    [int]$Seconds = 300,
    [string]$ExamLabel = "app=exam-service",
    [string]$GatewayLabel = "app=api-gateway",
    [string]$HpaName = "exam-service",
    [string]$PgPod = "postgres-0",
    [string]$PgDb = "exams_ssl_db",
    [string]$OutDir = "."
)

$ErrorActionPreference = "SilentlyContinue"
$OutDir = (Resolve-Path $OutDir).Path
$utf8 = New-Object System.Text.UTF8Encoding($false)
$resFile  = Join-Path $OutDir ("collect_{0}.csv" -f $RunId)
$podsFile = Join-Path $OutDir ("pods_{0}.csv" -f $RunId)

function Write-Header([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text + "`r`n", $utf8)
}
function Append-Line([string]$path, [string]$text) {
    [System.IO.File]::AppendAllText($path, $text + "`r`n", $utf8)
}
function Get-Pods([string]$label) {
    $json = kubectl get pods -n $Namespace -l $label -o json 2>$null | Out-String
    if (-not $json.Trim()) { return @() }
    $obj = $json | ConvertFrom-Json
    return @($obj.items | Where-Object { -not $_.metadata.deletionTimestamp })
}
function Test-Ready($pod) {
    $c = $pod.status.conditions | Where-Object { $_.type -eq "Ready" -and $_.status -eq "True" }
    return [bool]$c
}
function To-Iso($v) {
    if ($v -is [datetime]) { return $v.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }
    return [string]$v
}
function To-Milli([string]$v) {
    if ($v -match '^(\d+)m$') { return [double]$Matches[1] }
    if ($v -match '^\d+(\.\d+)?$') { return [double]$v * 1000 }
    return $null
}

Write-Header $resFile "epoch,time,exam_pods,exam_ready,gateway_pods,hpa_current,hpa_desired,node_cpu_pct,node_mem_pct,exam_cpu_m_avg,pg_idle_in_tx,pg_active"
Write-Header $podsFile "epoch,time,pod,ready,created"

Write-Host "Dang lay mau moi ${Interval}s trong ${Seconds}s"
Write-Host "  -> $resFile"
Write-Host "  -> $podsFile"
Write-Host "Bam Ctrl+C de dung som."

$stop = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $stop) {
    $loopStart = Get-Date
    $epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $timeIso = $loopStart.ToString("yyyy-MM-dd HH:mm:ss")

    # --- pod exam: trang thai Ready tung pod (gio cua may ban, khong phai gio dong ho trong cluster)
    $exam = @(Get-Pods $ExamLabel)
    $ready = 0
    foreach ($p in $exam) {
        $r = Test-Ready $p
        if ($r) { $ready++ }
        Append-Line $podsFile ("{0},{1},{2},{3},{4}" -f $epoch, $timeIso, $p.metadata.name, $r, (To-Iso $p.metadata.creationTimestamp))
    }

    # --- so pod gateway
    $gw = @(Get-Pods $GatewayLabel).Count

    # --- HPA cua exam-service
    $hpaCur = ""; $hpaDes = ""
    $hpaJson = kubectl get hpa $HpaName -n $Namespace -o json 2>$null | Out-String
    if ($hpaJson.Trim()) {
        $h = $hpaJson | ConvertFrom-Json
        $hpaCur = $h.status.currentReplicas
        $hpaDes = $h.status.desiredReplicas
    }

    # --- CPU / RAM cua node (dong dau tien)
    $nodeCpu = ""; $nodeMem = ""
    $line = kubectl top nodes --no-headers 2>$null | Select-Object -First 1
    if ($line) {
        $f = ($line.ToString().Trim() -split "\s+")
        if ($f.Count -ge 5) { $nodeCpu = $f[2].TrimEnd("%"); $nodeMem = $f[4].TrimEnd("%") }
    }

    # --- CPU trung binh cua cac pod exam (milli-core)
    $cpuAvg = ""
    $vals = @()
    kubectl top pods -n $Namespace -l $ExamLabel --no-headers 2>$null | ForEach-Object {
        $f = ($_.ToString().Trim() -split "\s+")
        if ($f.Count -ge 2) { $m = To-Milli $f[1]; if ($m -ne $null) { $vals += $m } }
    }
    if ($vals.Count -gt 0) { $cpuAvg = [math]::Round(($vals | Measure-Object -Average).Average, 0) }

    # --- ket noi Postgres theo trang thai
    $idleTx = 0; $active = 0
    $sql = "select state, count(*) from pg_stat_activity where datname='$PgDb' group by 1;"
    kubectl exec $PgPod -n $Namespace -- psql -U postgres -d $PgDb -t -A -F "," -c $sql 2>$null | ForEach-Object {
        $f = $_.ToString().Split(",")
        if ($f.Count -eq 2) {
            if ($f[0] -eq "idle in transaction") { $idleTx = [int]$f[1] }
            elseif ($f[0] -eq "active") { $active = [int]$f[1] }
        }
    }

    Append-Line $resFile ("{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11}" -f `
        $epoch, $timeIso, $exam.Count, $ready, $gw, $hpaCur, $hpaDes, $nodeCpu, $nodeMem, $cpuAvg, $idleTx, $active)

    $spent = ((Get-Date) - $loopStart).TotalSeconds
    if ($spent -lt $Interval) { Start-Sleep -Seconds ([math]::Ceiling($Interval - $spent)) }
}
Write-Host "Xong."