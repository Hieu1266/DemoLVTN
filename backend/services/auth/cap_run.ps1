<#
.SYNOPSIS
  Chay test tai theo bac thang de tim "vien gach" cua 1 pod exam.
  Moi bac chay $Reps lan. Dung lai khi gap bac dau tien khong dat (diem gay) neu bat -StopAtKnee.

.EXAMPLE
  .\cap_run.ps1 -AccessCode ABC123 -StopAtKnee
  .\cap_run.ps1 -AccessCode ABC123 -Steps 20,40,60,80 -Reps 1     # chay thu nhanh
  .\cap_run.ps1 -AccessCode ABC123 -Tag CAP2 -Pods 2 -Steps 40,60,80,100 -StopAtKnee   # 2 pod exam

  Chay trong thu muc co lb_test.js, collect.ps1, analyze_lb.py, users.json, cap_check.py.
#>
param(
    [string]$AccessCode = "",
    [int[]]$Steps = @(20, 40, 60, 80, 100, 150, 200, 300),
    [int]$Reps = 3,
    [int]$RampSec = 30,
    [int]$HoldSec = 120,
    [int]$DownSec = 15,
    [int]$RestSec = 180,
    [int]$Pods = 1,
    [string]$Tag = "CAP",
    [string]$ExportDir = "export",
    [string]$Gateway = "",
    [switch]$StopAtKnee
)

$ErrorActionPreference = "Continue"
$work = (Get-Location).Path
New-Item -ItemType Directory -Force -Path $ExportDir | Out-Null

foreach ($f in @("lb_test.js", "collect.ps1", "analyze_lb.py", "cap_check.py", "users.json")) {
    if (-not (Test-Path (Join-Path $work $f))) { Write-Host "Thieu file $f trong thu muc hien tai" -ForegroundColor Red; exit 1 }
}

$total = $RampSec + $HoldSec + $DownSec
$snapAt = $RampSec + [int]($HoldSec * 0.6)   # chup CPU cac pod luc dang giu tai

foreach ($vu in $Steps) {
    for ($r = 1; $r -le $Reps; $r++) {
        $run = "$Tag-V$vu-$r"
        Write-Host ""
        Write-Host "===== $run  ($vu VU, $total giay) =====" -ForegroundColor Green

        # 1. Lay mau cluster o cua so rieng
        $collect = Start-Process powershell -PassThru -WindowStyle Minimized -WorkingDirectory $work `
            -ArgumentList "-NoProfile", "-File", (Join-Path $work "collect.ps1"), "-RunId", $run, "-Seconds", ($total + 60)
        Start-Sleep -Seconds 8

        # 2. Chup CPU tat ca pod luc dang giu tai (de biet gateway/auth co nghen khong)
        $snapFile = Join-Path $work ("top_{0}.txt" -f $run)
        $job = Start-Job -ScriptBlock {
            param($wait, $file)
            Start-Sleep -Seconds $wait
            kubectl top pods -n ssl --no-headers | Out-File -Encoding utf8 $file
        } -ArgumentList $snapAt, $snapFile

        # 3. k6
        $k6args = @("run", "--out", "csv=lb_$run.csv", "-e", "PROFILE=cap", "-e", "VUS=$vu",
            "-e", "RAMP=$RampSec", "-e", "HOLD=$HoldSec", "-e", "DOWN=$DownSec")
        if ($AccessCode) { $k6args += @("-e", "ACCESS_CODE=$AccessCode") }
        if ($Gateway)    { $k6args += @("-e", "GATEWAY_BASE=$Gateway") }
        $k6args += "lb_test.js"
        & k6 @k6args 2>&1 | Tee-Object -FilePath "k6_$run.log" | Select-String -Pattern "PRECHECK|thresholds|http_reqs|ERRO|abort" 

        # 4. Cho collect xong roi phan tich
        $collect.WaitForExit()
        Receive-Job $job -Wait | Out-Null
        Remove-Job $job -Force

        python analyze_lb.py "lb_$run.csv" --run-id $run --pods "pods_$run.csv" --collect "collect_$run.csv" --export-dir $ExportDir

        $isLast = ($vu -eq $Steps[-1]) -and ($r -eq $Reps)
        if (-not $isLast) {
            Write-Host "Nghi $RestSec giay cho he thong on dinh..." -ForegroundColor DarkGray
            Start-Sleep -Seconds $RestSec
        }
    }

    # 5. Danh gia bac nay
    python cap_check.py --tag $Tag --export-dir $ExportDir --vus $vu --ramp $RampSec --hold $HoldSec --pods $Pods --gate
    if ($LASTEXITCODE -ne 0 -and $StopAtKnee) {
        Write-Host "Bac $vu VU khong dat -> dung (da qua diem gay)." -ForegroundColor Yellow
        break
    }
}

Write-Host ""
Write-Host "===== TONG KET =====" -ForegroundColor Green
python cap_check.py --tag $Tag --export-dir $ExportDir --ramp $RampSec --hold $HoldSec --pods $Pods