$codexDir = "$env:USERPROFILE\.codex"

Write-Host "=== Chuyen Codex sang VietAPI ==="

if (-not (Test-Path $codexDir)) {
  New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
  Write-Host "Da tao thu muc .codex"
}

$configPath = "$codexDir\config.toml"
$configBackup = "$codexDir\config.chatgpt.bak"
$noConfigMarker = "$codexDir\config.chatgpt.none"

# Chi backup cau hinh ChatGPT/mac dinh. Khong ghi de backup khi dang o DevQuote/VietAPI.
if (Test-Path $configPath) {
  $currentConfig = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
  $isExternalProvider = $currentConfig -match 'model_provider\s*=\s*"(devquote|vietapi)"'

  if (-not $isExternalProvider) {
    Copy-Item $configPath $configBackup -Force
    Remove-Item $noConfigMarker -Force -ErrorAction SilentlyContinue
    Write-Host "Da backup config ChatGPT/mac dinh hien tai."
  } else {
    Write-Host "Config hien tai dang la provider ngoai; giu nguyen backup ChatGPT cu."
  }
} else {
  New-Item -ItemType File -Path $noConfigMarker -Force | Out-Null
  Write-Host "Khong co config.toml hien tai, da danh dau de khi quay ve se xoa config."
}

# Nhap an API key, khong hien ky tu tren man hinh.
$secureKey = Read-Host "Paste VietAPI API Key vao day" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "Ban chua nhap API key. Huy thao tac."
  exit
}

$model = Read-Host "Model mac dinh (Enter = gpt-5.5)"
if ([string]::IsNullOrWhiteSpace($model)) {
  $model = "gpt-5.5"
}

# Chan ky tu co the lam hong file TOML.
if ($model -notmatch '^[A-Za-z0-9._-]+$') {
  Write-Host "Ten model khong hop le. Huy thao tac."
  exit
}

# Luu key vao bien moi truong User, khong ghi key vao config.toml hay auth.json.
[Environment]::SetEnvironmentVariable("VIETAPI_API_KEY", $key, "User")
$env:VIETAPI_API_KEY = $key

@"
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
"@ | Out-File -FilePath $configPath -Encoding utf8

Remove-Variable key -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Da chuyen Codex sang VietAPI voi model: $model"
Write-Host "Hay tat hoan toan VS Code/Codex CLI, sau do mo lai de nhan bien moi truong va config moi."
Write-Host "Quay ve ChatGPT: chay lai file switch-codex-chatgpt.ps1 cu cua ban."
