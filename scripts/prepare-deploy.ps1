#Requires -Version 5.1
<#
.SYNOPSIS
  Build frontend into backend/public and create host upload zip.

.DESCRIPTION
  Source of truth (edit only these):
    - backend/   Laravel API + public SPA shell
    - client/    React UI

  Output only:
    - backend/public updated with latest SPA build
    - artifacts/ladystars-host-code.zip  (no vendor, no .env)
    - artifacts/DEPLOY-MANIFEST.txt

  There is NO long-lived deploy-upload/ folder. Staging is temporary.

.EXAMPLE
  npm run deploy:prepare
#>

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($msg) {
  Write-Host ""
  Write-Host "===== $msg =====" -ForegroundColor Cyan
}

function Assert-LastExit($label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

Write-Step "1/4 Client production build"
& npm.cmd run build -w client
Assert-LastExit "client build"

Write-Step "2/4 Copy client dist -> backend/public"
$dist = Join-Path $Root 'client\dist'
$pub = Join-Path $Root 'backend\public'
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  throw "client/dist/index.html missing after build"
}

$assetsDir = Join-Path $pub 'assets'
if (Test-Path $assetsDir) {
  Get-ChildItem $assetsDir -File | Where-Object {
    $_.Name -match '^index-.*\.(js|css)$'
  } | Remove-Item -Force
}

Copy-Item -Force (Join-Path $dist 'index.html') (Join-Path $pub 'index.html')
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
Copy-Item -Force (Join-Path $dist 'assets\*') $assetsDir
if (Test-Path (Join-Path $dist 'logo.jpg')) {
  Copy-Item -Force (Join-Path $dist 'logo.jpg') (Join-Path $pub 'logo.jpg')
}

$indexHtml = Get-Content (Join-Path $pub 'index.html') -Raw
Write-Host "SPA index references:"
[regex]::Matches($indexHtml, 'assets/[^"\s]+') | ForEach-Object { Write-Host "  $($_.Value)" }

Write-Step "3/4 Stage temp folder + zip (no vendor, no .env)"
$artifacts = Join-Path $Root 'artifacts'
if (-not (Test-Path $artifacts)) { New-Item -ItemType Directory -Path $artifacts | Out-Null }
$zipPath = Join-Path $artifacts 'ladystars-host-code.zip'
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

$stage = Join-Path $env:TEMP ("ladystars-deploy-stage-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
  $src = Join-Path $Root 'backend'
  $trees = @('app', 'bootstrap', 'config', 'database', 'public', 'resources', 'routes')
  foreach ($tree in $trees) {
    $from = Join-Path $src $tree
    if (-not (Test-Path $from)) { continue }
    $to = Join-Path $stage $tree
    New-Item -ItemType Directory -Force -Path $to | Out-Null
    & robocopy $from $to /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np `
      /XD tests node_modules .git cache `
      /XF .env .env.local phpunit.xml *.sqlite
    if ($LASTEXITCODE -ge 8) { throw "robocopy $tree failed: $LASTEXITCODE" }
  }

  foreach ($file in @('artisan', 'composer.json', 'composer.lock')) {
    $fromFile = Join-Path $src $file
    if (Test-Path $fromFile) {
      Copy-Item -Force $fromFile (Join-Path $stage $file)
    }
  }

  # Empty writable placeholders (host already has real storage/vendor)
  foreach ($rel in @(
    'storage\app\public',
    'storage\framework\cache',
    'storage\framework\sessions',
    'storage\framework\views',
    'storage\logs',
    'bootstrap\cache'
  )) {
    $p = Join-Path $stage $rel
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
  }

  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -Force
}
finally {
  Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}

$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Zip: $zipPath ($zipSize MB)"

Write-Step "4/4 Write manifest"
$js = Get-ChildItem (Join-Path $pub 'assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue | Select-Object -First 1
$css = Get-ChildItem (Join-Path $pub 'assets') -Filter 'index-*.css' -ErrorAction SilentlyContinue | Select-Object -First 1
$manifest = @"
LadyStars host deploy package
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

SOURCE OF TRUTH (edit only)
- backend/
- client/

OUTPUT
- artifacts/ladystars-host-code.zip  ($zipSize MB, no vendor, no .env)
- backend/public  (SPA built in-place)

SPA ASSETS
- JS : $($js.Name)
- CSS: $($css.Name)

HOST
1. Upload zip into public_html -> Extract (overwrite code)
2. Keep host .env + vendor + database
3. Optional: APP_TIMEZONE=Asia/Ho_Chi_Minh + config:clear
4. Browser Ctrl+F5

NO deploy-upload/ folder — do not recreate as source of truth.
"@

Set-Content -Path (Join-Path $artifacts 'DEPLOY-MANIFEST.txt') -Value $manifest -Encoding utf8

Write-Host ""
Write-Host "DEPLOY PREPARE OK" -ForegroundColor Green
Write-Host "  Zip: artifacts\ladystars-host-code.zip"
Write-Host ""
exit 0
