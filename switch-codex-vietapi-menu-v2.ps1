# switch-codex-vietapi-menu-v2.ps1
# VietAPI model selector for Codex CLI + Codex extension.
# Stores the API key in the User environment variable VIETAPI_API_KEY.
# Never writes the API key to config.toml or auth.json.

$ErrorActionPreference = "Stop"

$codexDir = Join-Path $env:USERPROFILE ".codex"
$configPath = Join-Path $codexDir "config.toml"
$chatgptBackup = Join-Path $codexDir "config.chatgpt.bak"
$noConfigMarker = Join-Path $codexDir "config.chatgpt.none"
$selectionPath = Join-Path $codexDir "vietapi-current-model.txt"

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

function Write-ModelMenu {
    param([array]$Models)

    Write-Host ""
    Write-Host "================= VIETAPI MODEL MENU =================" -ForegroundColor Cyan
    Write-Host "Chon MODEL MAC DINH ghi vao ~/.codex/config.toml."
    Write-Host "OFFICIAL = ten gach noi. DISTILL = ten co dau cham."
    Write-Host "Nhap 0 de go Model ID thu cong; Q de huy."
    Write-Host "-------------------------------------------------------"

    for ($i = 0; $i -lt $Models.Count; $i++) {
        $item = $Models[$i]
        $number = ($i + 1).ToString().PadLeft(2)
        $color = switch ($item.Kind) {
            "OFFICIAL" { "Yellow" }
            "DISTILL"  { "Magenta" }
            default    { "Green" }
        }

        Write-Host (" {0}. {1}" -f $number, $item.Id) -NoNewline
        Write-Host ("  [{0}]  {1}" -f $item.Kind, $item.Label) -ForegroundColor $color
    }

    Write-Host "-------------------------------------------------------"
    Write-Host "  0. Tu nhap Model ID"
    Write-Host "  Q. Huy, khong thay doi gi"
    Write-Host "=======================================================" -ForegroundColor Cyan
}

function Select-Model {
    param([array]$Models)

    while ($true) {
        Write-ModelMenu -Models $Models
        $choice = (Read-Host "Lua chon cua ban").Trim()

        if ($choice -match '^(q|Q)$') { return $null }

        if ($choice -eq "0") {
            $customModel = (Read-Host "Nhap dung Model ID").Trim()
            if ($customModel -match '^[A-Za-z0-9._-]+$') {
                return $customModel
            }

            Write-Host "Model ID khong hop le." -ForegroundColor Red
            continue
        }

        $number = 0
        if ([int]::TryParse($choice, [ref]$number) -and
            $number -ge 1 -and $number -le $Models.Count) {
            return $Models[$number - 1].Id
        }

        Write-Host "Lua chon khong hop le." -ForegroundColor Red
    }
}

function Test-ResponsesEndpoint {
    param([string]$Model)

    Write-Host ""
    Write-Host "Dang gui mot request test truc tiep den /v1/responses..." -ForegroundColor Cyan

    $headers = @{
        Authorization = "Bearer $env:VIETAPI_API_KEY"
        "Content-Type" = "application/json"
    }

    $body = @{
        model = $Model
        input = "Reply exactly with OK."
    } | ConvertTo-Json -Compress

    try {
        $response = Invoke-RestMethod `
            -Method Post `
            -Uri "https://api.vietapi.tech/v1/responses" `
            -Headers $headers `
            -Body $body `
            -TimeoutSec 120

        Write-Host "Test request da gui thanh cong." -ForegroundColor Green
        Write-Host "Vao VietAPI > Request logs va xem model hien trong dong request nay."
        return $true
    }
    catch {
        Write-Host "Test request loi:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $false
    }
}

# Catalog model tu trang VietAPI ban gui.
# Giữ cả model OFFICIAL dù gói hiện tại có thể chưa được cấp.
$models = @(
    [PSCustomObject]@{ Id = "gpt-5.4";                  Kind = "CATALOG";  Label = "GPT 5.4" }
    [PSCustomObject]@{ Id = "gpt-5.5";                  Kind = "CATALOG";  Label = "GPT 5.5" }
    [PSCustomObject]@{ Id = "gpt-5.5-high";             Kind = "CATALOG";  Label = "GPT 5.5 High" }
    [PSCustomObject]@{ Id = "gpt-5.5-xhigh";            Kind = "CATALOG";  Label = "GPT 5.5 XHigh" }
    [PSCustomObject]@{ Id = "kimi-k2.6";                Kind = "CATALOG";  Label = "Kimi K2.6" }

    [PSCustomObject]@{ Id = "claude-opus-4-6";          Kind = "OFFICIAL"; Label = "Claude Opus official" }
    [PSCustomObject]@{ Id = "claude-opus-4-7";          Kind = "OFFICIAL"; Label = "Claude Opus official" }
    [PSCustomObject]@{ Id = "claude-opus-4-8";          Kind = "OFFICIAL"; Label = "Claude Opus official" }

    [PSCustomObject]@{ Id = "claude-opus-4.6";          Kind = "DISTILL";  Label = "Claude Opus 4.6 distill" }
    [PSCustomObject]@{ Id = "claude-opus-4.7";          Kind = "DISTILL";  Label = "Claude Opus 4.7 distill" }
    [PSCustomObject]@{ Id = "claude-opus-4.8";          Kind = "DISTILL";  Label = "Claude Opus 4.8 distill" }
    [PSCustomObject]@{ Id = "claude-opus-4.6-thinking"; Kind = "DISTILL";  Label = "Claude Opus 4.6 thinking distill" }
    [PSCustomObject]@{ Id = "claude-opus-4.7-thinking"; Kind = "DISTILL";  Label = "Claude Opus 4.7 thinking distill" }
    [PSCustomObject]@{ Id = "claude-opus-4.8-thinking"; Kind = "DISTILL";  Label = "Claude Opus 4.8 thinking distill" }

    [PSCustomObject]@{ Id = "deepseek-v4-flash";        Kind = "CATALOG";  Label = "DeepSeek V4 Flash" }
    [PSCustomObject]@{ Id = "deepseek-v4-pro";          Kind = "CATALOG";  Label = "DeepSeek V4 Pro" }
    [PSCustomObject]@{ Id = "glm-5.1";                  Kind = "CATALOG";  Label = "GLM 5.1" }
    [PSCustomObject]@{ Id = "minimax-m3";               Kind = "CATALOG";  Label = "MiniMax M3" }
)

Write-Host ""
Write-Host "=== Chuyen Codex sang VietAPI ===" -ForegroundColor Cyan

if (-not (Test-Path $codexDir)) {
    New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
}

# Preserve a ChatGPT/default config once, and also preserve the current config
# before every rewrite so custom settings are not silently lost.
if (Test-Path $configPath) {
    $currentConfig = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
    $isExternalProvider = $currentConfig -match 'model_provider\s*=\s*"(devquote|vietapi)"'

    if (-not $isExternalProvider) {
        Copy-Item $configPath $chatgptBackup -Force
        Remove-Item $noConfigMarker -Force -ErrorAction SilentlyContinue
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item $configPath (Join-Path $codexDir "config.before-vietapi-$stamp.bak") -Force
}
else {
    New-Item -ItemType File -Path $noConfigMarker -Force | Out-Null
}

$existingKey = [Environment]::GetEnvironmentVariable("VIETAPI_API_KEY", "User")
if ([string]::IsNullOrWhiteSpace($existingKey)) {
    $prompt = "Paste VietAPI API Key (ky tu se an)"
}
else {
    $prompt = "Paste API Key moi (Enter de dung lai key da luu)"
}

$secureKey = Read-Host $prompt -AsSecureString
$newKey = ConvertTo-PlainText -SecureString $secureKey
$key = if ([string]::IsNullOrWhiteSpace($newKey)) { $existingKey } else { $newKey }

if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host "Chua co API key. Huy thao tac." -ForegroundColor Red
    exit 1
}

$model = Select-Model -Models $models
if ($null -eq $model) {
    Write-Host "Da huy. Khong thay doi cau hinh." -ForegroundColor Yellow
    exit 0
}

[Environment]::SetEnvironmentVariable("VIETAPI_API_KEY", $key, "User")
$env:VIETAPI_API_KEY = $key

@"
# Generated by switch-codex-vietapi-menu-v2.ps1
model = "$model"
model_provider = "vietapi"

[model_providers.vietapi]
name = "VietAPI"
base_url = "https://api.vietapi.tech/v1"
env_key = "VIETAPI_API_KEY"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 5
stream_idle_timeout_ms = 300000
"@ | Set-Content -Path $configPath -Encoding UTF8

@"
Model selected: $model
Selected at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@ | Set-Content -Path $selectionPath -Encoding UTF8

Remove-Variable key -ErrorAction SilentlyContinue
Remove-Variable newKey -ErrorAction SilentlyContinue
Remove-Variable existingKey -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Da luu model mac dinh: $model" -ForegroundColor Green
Write-Host "File config: $configPath"
Write-Host "Ghi nhan lua chon: $selectionPath"

$runTest = (Read-Host "Test truc tiep model nay qua /v1/responses ngay bay gio? (Y/N)").Trim()
if ($runTest -match '^(y|Y)$') {
    Test-ResponsesEndpoint -Model $model | Out-Null
}

Write-Host ""
Write-Host "De dung trong Codex extension:" -ForegroundColor Yellow
Write-Host "1. Dong tat ca cua so VS Code, mo lai."
Write-Host "2. Tao New Chat. Khong tiep tuc thread cu."
Write-Host "3. Neu model selector trong chat da chon model khac, no co the ghi de config."
Write-Host "4. Xem VietAPI Request logs de xac nhan model request that."
