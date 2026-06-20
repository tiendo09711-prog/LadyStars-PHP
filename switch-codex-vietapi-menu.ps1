# switch-codex-vietapi-menu.ps1
# Chuyen Codex CLI + Codex extension sang VietAPI va chon model mac dinh.
# API key duoc luu trong User Environment Variable: VIETAPI_API_KEY
# Key KHONG duoc ghi vao config.toml hay auth.json.

$ErrorActionPreference = "Stop"

$codexDir = Join-Path $env:USERPROFILE ".codex"
$configPath = Join-Path $codexDir "config.toml"
$configBackup = Join-Path $codexDir "config.chatgpt.bak"
$noConfigMarker = Join-Path $codexDir "config.chatgpt.none"

function ConvertTo-PlainText {
    param([System.Security.SecureString]$SecureString)

    if ($null -eq $SecureString) {
        return ""
    }

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
    Write-Host "================ VIETAPI MODEL MENU ================" -ForegroundColor Cyan
    Write-Host "Chon so thu tu de dat MODEL MAC DINH cho Codex."
    Write-Host "Model [BANNED] van duoc giu trong menu de dung khi shop mo lai."
    Write-Host "Nhap 0 de tu go Model ID khac. Nhap Q de huy."
    Write-Host "-----------------------------------------------------"

    for ($i = 0; $i -lt $Models.Count; $i++) {
        $item = $Models[$i]
        $number = ($i + 1).ToString().PadLeft(2)
        $statusColor = if ($item.Status -eq "BANNED") { "Yellow" } else { "Green" }
        Write-Host (" {0}. {1}" -f $number, $item.Id) -NoNewline
        Write-Host ("  [{0}]  {1}" -f $item.Status, $item.Label) -ForegroundColor $statusColor
    }

    Write-Host "-----------------------------------------------------"
    Write-Host "  0. Tu nhap Model ID"
    Write-Host "  Q. Huy, khong thay doi gi"
    Write-Host "=====================================================" -ForegroundColor Cyan
}

function Select-Model {
    param([array]$Models)

    while ($true) {
        Write-ModelMenu -Models $Models
        $choice = (Read-Host "Lua chon cua ban").Trim()

        if ($choice -match '^(q|Q)$') {
            return $null
        }

        if ($choice -eq "0") {
            $customModel = (Read-Host "Nhap dung Model ID").Trim()
            if ($customModel -match '^[A-Za-z0-9._-]+$') {
                return $customModel
            }

            Write-Host "Model ID khong hop le. Chi dung chu, so, dau cham, gach ngang, gach duoi." -ForegroundColor Red
            continue
        }

        $number = 0
        if ([int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $Models.Count) {
            return $Models[$number - 1].Id
        }

        Write-Host "Lua chon khong hop le. Hay nhap so trong menu, 0, hoac Q." -ForegroundColor Red
    }
}

# Danh sach tu dashboard VietAPI tai thoi diem tao script.
# Co ca cac ID dang Banned de ban co the chon lai khi shop mo.
$models = @(
    [PSCustomObject]@{ Id = "gpt-5.5";                  Status = "AVAILABLE"; Label = "GPT premium" }
    [PSCustomObject]@{ Id = "gpt-5.5-high";             Status = "AVAILABLE"; Label = "GPT high" }
    [PSCustomObject]@{ Id = "gpt-5.5-xhigh";            Status = "AVAILABLE"; Label = "GPT xhigh" }
    [PSCustomObject]@{ Id = "gpt-5.4";                  Status = "AVAILABLE"; Label = "GPT" }
    [PSCustomObject]@{ Id = "kimi-k2.6";                Status = "AVAILABLE"; Label = "Kimi" }
    [PSCustomObject]@{ Id = "claude-opus-4-6";          Status = "BANNED";    Label = "Premium (SVIP) - dang khoa" }
    [PSCustomObject]@{ Id = "claude-opus-4-7";          Status = "BANNED";    Label = "Premium (SVIP) - dang khoa" }
    [PSCustomObject]@{ Id = "claude-opus-4-8";          Status = "BANNED";    Label = "Premium (SVIP) - dang khoa" }
    [PSCustomObject]@{ Id = "claude-opus-4.6";          Status = "AVAILABLE"; Label = "Opus Premium" }
    [PSCustomObject]@{ Id = "claude-opus-4.7";          Status = "AVAILABLE"; Label = "Opus Premium" }
    [PSCustomObject]@{ Id = "claude-opus-4.8";          Status = "AVAILABLE"; Label = "Opus Premium" }
    [PSCustomObject]@{ Id = "claude-opus-4.6-thinking"; Status = "AVAILABLE"; Label = "Opus Thinking" }
    [PSCustomObject]@{ Id = "claude-opus-4.7-thinking"; Status = "AVAILABLE"; Label = "Opus Thinking" }
    [PSCustomObject]@{ Id = "claude-opus-4.8-thinking"; Status = "AVAILABLE"; Label = "Opus Thinking" }
    [PSCustomObject]@{ Id = "deepseek-v4-flash";        Status = "AVAILABLE"; Label = "DeepSeek Flash" }
    [PSCustomObject]@{ Id = "deepseek-v4-pro";          Status = "AVAILABLE"; Label = "DeepSeek Pro reasoning" }
    [PSCustomObject]@{ Id = "minimax-m3";               Status = "AVAILABLE"; Label = "MiniMax M3" }
    [PSCustomObject]@{ Id = "glm-5.1";                  Status = "AVAILABLE"; Label = "GLM 5.1" }
    [PSCustomObject]@{ Id = "claude-sonnet-4.6";        Status = "AVAILABLE"; Label = "Claude Sonnet" }
    [PSCustomObject]@{ Id = "claude-sonnet-4.5-lite";   Status = "AVAILABLE"; Label = "Claude Sonnet Lite" }
    [PSCustomObject]@{ Id = "claude-haiku-4.5";         Status = "AVAILABLE"; Label = "Claude Haiku" }
)

Write-Host ""
Write-Host "=== Chuyen Codex sang VietAPI ===" -ForegroundColor Cyan

if (-not (Test-Path $codexDir)) {
    New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
    Write-Host "Da tao thu muc: $codexDir"
}

# Backup cau hinh ChatGPT/mac dinh mot lan. Khong ghi de backup khi dang dung provider ngoai.
if (Test-Path $configPath) {
    $currentConfig = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
    $isExternalProvider = $currentConfig -match 'model_provider\s*=\s*"(devquote|vietapi)"'

    if (-not $isExternalProvider) {
        Copy-Item $configPath $configBackup -Force
        Remove-Item $noConfigMarker -Force -ErrorAction SilentlyContinue
        Write-Host "Da backup config ChatGPT/mac dinh hien tai."
    }
    else {
        Write-Host "Config hien tai dang dung provider ngoai; giu nguyen backup ChatGPT cu."
    }
}
else {
    New-Item -ItemType File -Path $noConfigMarker -Force | Out-Null
    Write-Host "Khong co config.toml hien tai; da danh dau de khi quay ve se xoa config."
}

# Neu da luu key VietAPI, cho phep Enter de dung lai key cu.
$existingKey = [Environment]::GetEnvironmentVariable("VIETAPI_API_KEY", "User")
if ([string]::IsNullOrWhiteSpace($existingKey)) {
    $keyPrompt = "Paste VietAPI API Key (ky tu se an)"
}
else {
    $keyPrompt = "Paste API Key moi (Enter de dung lai key VietAPI da luu; ky tu se an)"
}

$secureKey = Read-Host $keyPrompt -AsSecureString
$newKey = ConvertTo-PlainText -SecureString $secureKey

if ([string]::IsNullOrWhiteSpace($newKey)) {
    $key = $existingKey
}
else {
    $key = $newKey
}

if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host "Chua co API key. Huy thao tac." -ForegroundColor Red
    exit 1
}

$model = Select-Model -Models $models
if ($null -eq $model) {
    Write-Host "Da huy. Khong thay doi cau hinh." -ForegroundColor Yellow
    exit 0
}

# Luu key o cap User, khong luu vao file cau hinh hay auth.json.
[Environment]::SetEnvironmentVariable("VIETAPI_API_KEY", $key, "User")
$env:VIETAPI_API_KEY = $key

$configContent = @"
# Generated by switch-codex-vietapi-menu.ps1
# Default model chosen in the script:
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
"@

Set-Content -Path $configPath -Value $configContent -Encoding UTF8

Remove-Variable key -ErrorAction SilentlyContinue
Remove-Variable newKey -ErrorAction SilentlyContinue
Remove-Variable existingKey -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Da chuyen Codex sang VietAPI." -ForegroundColor Green
Write-Host "Model mac dinh da chon: $model" -ForegroundColor Green
Write-Host "Config: $configPath"
Write-Host ""
Write-Host "Quan trong:" -ForegroundColor Yellow
Write-Host "1. Tat hoan toan VS Code, sau do mo lai."
Write-Host "2. Tao chat moi trong Codex extension de no doc model mac dinh moi."
Write-Host "3. Neu ban tu chon model khac o model selector trong Codex, model do co the ghi de cho phien hien tai."
Write-Host "4. Neu chon model [BANNED], Codex se bao loi cho den khi VietAPI mo model do."
Write-Host "5. De kiem tra model dang xu ly request that, xem Request logs tren dashboard VietAPI."
Write-Host ""
Write-Host "Quay ve ChatGPT/Gmail: chay switch-codex-chatgpt.ps1 cu cua ban."
