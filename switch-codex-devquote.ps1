$codexDir = "$env:USERPROFILE\.codex"

Write-Host "=== Chuyen Codex sang DevQuote API ==="

if (-not (Test-Path $codexDir)) {
  New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
  Write-Host "Da tao thu muc .codex"
}

$configPath = "$codexDir\config.toml"
$authPath = "$codexDir\auth.json"

$configBackup = "$codexDir\config.chatgpt.bak"
$authBackup = "$codexDir\auth.chatgpt.bak"
$noConfigMarker = "$codexDir\config.chatgpt.none"

# Backup config ChatGPT hien tai neu chua phai DevQuote
if (Test-Path $configPath) {
  $currentConfig = Get-Content $configPath -Raw -ErrorAction SilentlyContinue

  if ($currentConfig -notmatch 'model_provider\s*=\s*"devquote"') {
    Copy-Item $configPath $configBackup -Force
    Remove-Item $noConfigMarker -Force -ErrorAction SilentlyContinue
    Write-Host "Da backup config ChatGPT hien tai."
  } else {
    Write-Host "Config hien tai dang la DevQuote, khong ghi de backup ChatGPT."
  }
} else {
  New-Item -ItemType File -Path $noConfigMarker -Force | Out-Null
  Write-Host "Khong co config.toml hien tai, da danh dau de khi quay ve se xoa config."
}

# Backup auth ChatGPT neu co va khong phai auth.json dang chua API key cu
if (Test-Path $authPath) {
  $currentAuth = Get-Content $authPath -Raw -ErrorAction SilentlyContinue

  if ($currentAuth -notmatch 'OPENAI_API_KEY') {
    Copy-Item $authPath $authBackup -Force
    Write-Host "Da backup auth ChatGPT hien tai."
  } else {
    Write-Host "auth.json co ve dang chua API key cu, khong backup."
  }
}

$key = Read-Host "Paste DevQuote API Key vao day"

if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "Ban chua nhap API key. Huy thao tac."
  exit
}

# Luu key vao bien moi truong User, khong ghi thang vao file auth.json
[Environment]::SetEnvironmentVariable("DEVQUOTE_API_KEY", $key, "User")

@"
model_provider = "devquote"

[model_providers.devquote]
name = "DevQuote"
base_url = "https://sv.devquote.shop/v1"
env_key = "DEVQUOTE_API_KEY"
wire_api = "responses"
requires_openai_auth = false
"@ | Out-File -FilePath $configPath -Encoding utf8

Write-Host ""
Write-Host "Da chuyen Codex sang DevQuote API."
Write-Host "Hay tat han VS Code roi mo lai de nhan cau hinh moi."
Write-Host "Neu Codex van loi token, hay tao API key moi ben DevQuote vi key cu da bi lo."