# <#
# .SYNOPSIS
#   Chuan bi cluster de do "vien gach" cua 1 pod exam-service. Chay 1 lan truoc khi test.

# .NOTES
#   - Khong push len nhanh main trong luc test: workflow se apply lai yml va tao lai HPA / doi resources.
#   - Muon giu vinh vien thi sua k8s/backend.yml (requests = limits) va bo auto-scaling.yml.
# #>
# param(
#     [string]$Namespace = "ssl",
#     [string]$Cpu = "500m",
#     [string]$Mem = "1Gi",
#     [int]$ExamPods = 1,
#     [int]$GatewayPods = 2,
#     [int]$AuthPods = 2
# )

# function Run($cmd) {
#     Write-Host ">> $cmd" -ForegroundColor Cyan
#     Invoke-Expression $cmd
#     if ($LASTEXITCODE -ne 0) { Write-Host "LOI o lenh tren" -ForegroundColor Red; exit 1 }
# }

# # 1. Tat HPA de so pod khong tu doi
# Run "kubectl delete hpa --all -n $Namespace --ignore-not-found"

# # 2. Co dinh so pod
# Run "kubectl scale deploy/exam-service --replicas=$ExamPods -n $Namespace"
# Run "kubectl scale deploy/api-gateway --replicas=$GatewayPods -n $Namespace"
# Run "kubectl scale deploy/auth-service --replicas=$AuthPods -n $Namespace"

# # 3. Chot kich thuoc pod exam: requests = limits
# Run "kubectl set resources deploy/exam-service -n $Namespace --requests=cpu=$Cpu,memory=$Mem --limits=cpu=$Cpu,memory=$Mem"

# # 4. Gateway dung K8s Service de chia (so sanh cong bang voi 1 pod)
# Run "kubectl set env deploy/api-gateway LB_MODE=k8s -n $Namespace"

# # 5. Cho san sang
# foreach ($d in @("exam-service", "api-gateway", "auth-service")) {
#     Run "kubectl rollout status deploy/$d -n $Namespace --timeout=240s"
# }

# Write-Host ""
# Write-Host "=== TRANG THAI ===" -ForegroundColor Green
# kubectl get pods -n $Namespace -o wide
# kubectl get hpa -n $Namespace
# Write-Host ""
# Write-Host "Kiem tra: exam-service dung $ExamPods pod Ready, khong con HPA." -ForegroundColor Green
# Write-Host "Nho: PgBouncer default_pool_size / max_db_connections da nang chua (xem huong dan)." -ForegroundColor Yellow




# ---------------------------------------------------

<#
.SYNOPSIS
  Chuan bi cluster de do "vien gach" cua 1 pod exam-service. Chay 1 lan truoc khi test.

.NOTES
  - Khong push len nhanh main trong luc test: workflow se apply lai yml va tao lai HPA / doi resources.
  - Muon giu vinh vien thi sua k8s/backend.yml (requests = limits) va bo auto-scaling.yml.
#>
param(
    [string]$Namespace = "ssl",
    [string]$Cpu = "500m",
    [string]$Mem = "1Gi",
    [int]$ExamPods = 1,
    [int]$GatewayPods = 2,
    [int]$AuthPods = 2,
    [string]$LbMode = "k8s",       # k8s | p2c | least | rr
    [int]$ExamPerPod = -1          # >=0: dat EXAM_PER_POD_CONCURRENCY cho gateway (0 = tat gioi han theo pod)
)

function Run($cmd) {
    Write-Host ">> $cmd" -ForegroundColor Cyan
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { Write-Host "LOI o lenh tren" -ForegroundColor Red; exit 1 }
}

# 1. Tat HPA de so pod khong tu doi
Run "kubectl delete hpa --all -n $Namespace --ignore-not-found"

# 2. Co dinh so pod
Run "kubectl scale deploy/exam-service --replicas=$ExamPods -n $Namespace"
Run "kubectl scale deploy/api-gateway --replicas=$GatewayPods -n $Namespace"
Run "kubectl scale deploy/auth-service --replicas=$AuthPods -n $Namespace"

# 3. Chot kich thuoc pod exam: requests = limits
Run "kubectl set resources deploy/exam-service -n $Namespace --requests=cpu=$Cpu,memory=$Mem --limits=cpu=$Cpu,memory=$Mem"

# 4. Gateway: chon che do chia tai (+ gioi han dong thoi theo pod neu can)
if (Test-Path "headless.yaml") { Run "kubectl apply -f headless.yaml" }
$envs = "LB_MODE=$LbMode"
if ($ExamPerPod -ge 0) { $envs += " EXAM_PER_POD_CONCURRENCY=$ExamPerPod" }
Run "kubectl set env deploy/api-gateway $envs -n $Namespace"

# 5. Cho san sang
foreach ($d in @("exam-service", "api-gateway", "auth-service")) {
    Run "kubectl rollout status deploy/$d -n $Namespace --timeout=240s"
}

# 6. Xac nhan gateway dang chay code moi (limiter theo pod)
Start-Sleep -Seconds 8
try {
    $st = Invoke-RestMethod -Uri "http://localhost:30888/debug/state" -TimeoutSec 10
    Write-Host ("Gateway: mode={0}, so gateway={1}, exam instances={2}, exam max_concurrent={3}, per_pod={4}" -f $st.mode, $st.gateway_count, $st.pools.exam.instances.Count, $st.pools.exam.max_concurrent, $st.pools.exam.per_pod) -ForegroundColor Green
    if ($null -eq $st.gateway_count) { Write-Host "CANH BAO: gateway chua chay code moi (khong co gateway_count). Kiem tra workflow build image." -ForegroundColor Red }
} catch { Write-Host "Khong goi duoc /debug/state: $_" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== TRANG THAI ===" -ForegroundColor Green
kubectl get pods -n $Namespace -o wide
kubectl get hpa -n $Namespace
Write-Host ""
Write-Host "Kiem tra: exam-service dung $ExamPods pod Ready, khong con HPA." -ForegroundColor Green
Write-Host "Nho: PgBouncer default_pool_size / max_db_connections da nang chua (xem huong dan)." -ForegroundColor Yellow