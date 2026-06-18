$codexDir = "$env:USERPROFILE\.codex"

Write-Host "=== Chuyen Codex ve ChatGPT/Gmail ==="

$configPath = "$codexDir\config.toml"
$authPath = "$codexDir\auth.json"

$configBackup = "$codexDir\config.chatgpt.bak"
$authBackup = "$codexDir\auth.chatgpt.bak"
$noConfigMarker = "$codexDir\config.chatgpt.none"

if (-not (Test-Path $codexDir)) {
  New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
}

# Khoi phuc config ChatGPT
if (Test-Path $configBackup) {
  Copy-Item $configBackup $configPath -Force
  Write-Host "Da khoi phuc config ChatGPT tu backup."
} elseif (Test-Path $noConfigMarker) {
  Remove-Item $configPath -Force -ErrorAction SilentlyContinue
  Write-Host "Da xoa config.toml de Codex dung cau hinh mac dinh ChatGPT."
} else {
  Remove-Item $configPath -Force -ErrorAction SilentlyContinue
  Write-Host "Khong co backup config, da xoa config.toml de Codex dung mac dinh."
}

# Khoi phuc auth ChatGPT
if (Test-Path $authBackup) {
  Copy-Item $authBackup $authPath -Force
  Write-Host "Da khoi phuc auth ChatGPT."
} else {
  $currentAuth = ""
  if (Test-Path $authPath) {
    $currentAuth = Get-Content $authPath -Raw -ErrorAction SilentlyContinue
  }

  if ($currentAuth -match 'OPENAI_API_KEY') {
    Remove-Item $authPath -Force -ErrorAction SilentlyContinue
    Write-Host "Da xoa auth.json cu dang chua API key. Neu Codex hoi, hay Sign in lai bang Gmail/ChatGPT."
  } else {
    Write-Host "Khong co backup auth. Neu Codex hoi, hay Sign in lai bang Gmail/ChatGPT."
  }
}

Write-Host ""
Write-Host "Da chuyen Codex ve ChatGPT/Gmail."
Write-Host "Hay tat han VS Code roi mo lai."