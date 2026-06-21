# test-vietapi-codex-models.ps1
# Test tất cả model trong catalog VietAPI qua /v1/responses.
# Mục tiêu: kiểm tra model nào thực sự nhận được request theo chuẩn Codex.
# Script KHÔNG sửa ~/.codex/config.toml và KHÔNG lưu API key vào máy.

$ErrorActionPreference = "Stop"

# Catalog theo ảnh VietAPI bạn gửi.
# OFFICIAL = ID dùng dấu gạch nối; DISTILL = ID dùng dấu chấm.
$models = @(
    [PSCustomObject]@{ Id = "gpt-5.4";                  Type = "GPT" }
    [PSCustomObject]@{ Id = "gpt-5.5";                  Type = "GPT" }
    [PSCustomObject]@{ Id = "gpt-5.5-high";             Type = "GPT" }
    [PSCustomObject]@{ Id = "gpt-5.5-xhigh";            Type = "GPT" }
    [PSCustomObject]@{ Id = "kimi-k2.6";                Type = "Kimi" }

    [PSCustomObject]@{ Id = "claude-opus-4-6";          Type = "Claude OFFICIAL" }
    [PSCustomObject]@{ Id = "claude-opus-4-7";          Type = "Claude OFFICIAL" }
    [PSCustomObject]@{ Id = "claude-opus-4-8";          Type = "Claude OFFICIAL" }

    [PSCustomObject]@{ Id = "claude-opus-4.6";          Type = "Claude DISTILL" }
    [PSCustomObject]@{ Id = "claude-opus-4.7";          Type = "Claude DISTILL" }
    [PSCustomObject]@{ Id = "claude-opus-4.8";          Type = "Claude DISTILL" }
    [PSCustomObject]@{ Id = "claude-opus-4.6-thinking"; Type = "Claude DISTILL thinking" }
    [PSCustomObject]@{ Id = "claude-opus-4.7-thinking"; Type = "Claude DISTILL thinking" }
    [PSCustomObject]@{ Id = "claude-opus-4.8-thinking"; Type = "Claude DISTILL thinking" }

    [PSCustomObject]@{ Id = "deepseek-v4-flash";        Type = "DeepSeek" }
    [PSCustomObject]@{ Id = "deepseek-v4-pro";          Type = "DeepSeek" }
    [PSCustomObject]@{ Id = "glm-5.1";                  Type = "GLM" }
    [PSCustomObject]@{ Id = "minimax-m3";               Type = "MiniMax" }
)

function ConvertTo-PlainText {
    param([System.Security.SecureString]$SecureString)

    if ($null -eq $SecureString) { return "" }

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Get-ErrorDetails {
    param($ErrorRecord)

    $statusCode = $null
    $message = $ErrorRecord.Exception.Message

    try {
        $response = $ErrorRecord.Exception.Response
        if ($null -ne $response) {
            $statusCode = [int]$response.StatusCode

            # Windows PowerShell 5.1 response stream
            if ($response.PSObject.Methods.Name -contains "GetResponseStream") {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    $reader.Dispose()
                    if (-not [string]::IsNullOrWhiteSpace($body)) {
                        $message = $body
                    }
                }
            }
            # PowerShell 7 HttpResponseMessage
            elseif ($response.PSObject.Properties.Name -contains "Content") {
                $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if (-not [string]::IsNullOrWhiteSpace($body)) {
                    $message = $body
                }
            }
        }
    }
    catch {
        # Giữ message ban đầu nếu không đọc được error body.
    }

    if ($message.Length -gt 280) {
        $message = $message.Substring(0, 280) + "..."
    }

    return [PSCustomObject]@{
        StatusCode = $statusCode
        Message = $message
    }
}

$secureKey = Read-Host "Paste VietAPI API Key (ky tu se an, Enter de bat dau test)" -AsSecureString
$apiKey = ConvertTo-PlainText -SecureString $secureKey

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "Chua nhap API key. Da dung." -ForegroundColor Red
    exit 1
}

$runId = "codex-responses-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$endpoint = "https://api.vietapi.tech/v1/responses"
$headers = @{
    Authorization = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

$results = New-Object System.Collections.Generic.List[object]
$total = $models.Count

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Bat dau test $total model lan luot qua /v1/responses"
Write-Host "Run ID: $runId"
Write-Host "Moi model chi nhan 1 request nho: 'Reply exactly with OK.'"
Write-Host "Khong sua config Codex, khong luu API key."
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

for ($i = 0; $i -lt $models.Count; $i++) {
    $item = $models[$i]
    $index = $i + 1
    $startedAt = Get-Date
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    Write-Host ("[{0}/{1}] Testing {2} ({3})..." -f $index, $total, $item.Id, $item.Type) -NoNewline

    $body = @{
        model = $item.Id
        input = "[$runId] Codex Responses API compatibility test. Reply exactly with OK."
    } | ConvertTo-Json -Compress

    $status = "FAILED"
    $statusCode = $null
    $message = ""
    $responseId = ""

    try {
        # Không gửi stream để dashboard log rõ từng request.
        $response = Invoke-RestMethod `
            -Method Post `
            -Uri $endpoint `
            -Headers $headers `
            -Body $body `
            -TimeoutSec 150

        $status = "OK"
        $statusCode = 200

        if ($null -ne $response.id) {
            $responseId = [string]$response.id
        }

        Write-Host " OK" -ForegroundColor Green
    }
    catch {
        $errorInfo = Get-ErrorDetails -ErrorRecord $_
        $statusCode = $errorInfo.StatusCode
        $message = $errorInfo.Message

        if ($null -eq $statusCode) {
            $status = "NETWORK_OR_TIMEOUT"
            Write-Host " NETWORK/TIMEOUT" -ForegroundColor Yellow
        }
        else {
            $status = "HTTP_$statusCode"
            Write-Host " $status" -ForegroundColor Red
        }
    }

    $stopwatch.Stop()

    $results.Add([PSCustomObject]@{
        RunId       = $runId
        Index       = $index
        RequestedModel = $item.Id
        Family      = $item.Type
        Result      = $status
        HttpStatus  = $statusCode
        DurationSec = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 2)
        StartedAt   = $startedAt.ToString("yyyy-MM-dd HH:mm:ss")
        ResponseId  = $responseId
        Error       = $message
    })

    # Chờ ngắn để request logs trên dashboard dễ đọc theo từng model
    # và tránh đẩy request quá sát nhau.
    if ($i -lt ($models.Count - 1)) {
        Start-Sleep -Milliseconds 800
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = (Get-Location).Path
}

$csvPath = Join-Path $scriptDir "vietapi-codex-model-test-$runId.csv"
$jsonPath = Join-Path $scriptDir "vietapi-codex-model-test-$runId.json"

$results | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
$results | ConvertTo-Json -Depth 4 | Set-Content -Path $jsonPath -Encoding UTF8

$okCount = @($results | Where-Object { $_.Result -eq "OK" }).Count
$failedCount = $total - $okCount

Write-Host ""
Write-Host "==================== KET QUA ====================" -ForegroundColor Cyan
Write-Host "Tong: $total | OK: $okCount | Loi: $failedCount"
Write-Host ""
$results | Select-Object Index, RequestedModel, Family, Result, HttpStatus, DurationSec |
    Format-Table -AutoSize

Write-Host "CSV:  $csvPath" -ForegroundColor Green
Write-Host "JSON: $jsonPath" -ForegroundColor Green
Write-Host ""
Write-Host "Bay gio vao VietAPI > Request logs." -ForegroundColor Yellow
Write-Host "Log se cho biet model ma server da ghi nhan cho tung request."
Write-Host "Neu RequestedModel trong file la gpt-5.5-high nhung dashboard hien model khac,"
Write-Host "thi VietAPI dang alias/route o phia server; Codex hay PS1 khong ep duoc route do."

# Dọn key khỏi biến trong phiên PowerShell hiện tại.
Remove-Variable apiKey -ErrorAction SilentlyContinue
