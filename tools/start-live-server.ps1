param(
  [Parameter(Mandatory = $false)]
  [string]$WebAppUrl
)

$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $Repo

Write-Host "Anglo Factory Terminal LIVE Sheet bridge launcher" -ForegroundColor Yellow
Write-Host ""

if (-not $WebAppUrl) {
  $WebAppUrl = Read-Host "Paste FACTORY TERMINAL Web App /exec URL"
}

# Chat apps can copy a displayed link as [url](url). Accept that form, but
# validate the result before stopping the currently running terminal server.
if ($WebAppUrl -match '^\[(https://[^\]]+)\]\(https://[^\)]+\)$') {
  $WebAppUrl = $Matches[1]
  Write-Host "Removed copied Markdown link formatting." -ForegroundColor DarkYellow
}

$parsedWebAppUrl = $null
$validWebAppUrl = [Uri]::TryCreate($WebAppUrl, [UriKind]::Absolute, [ref]$parsedWebAppUrl) -and
  $parsedWebAppUrl.Scheme -eq "https" -and
  $parsedWebAppUrl.Host -eq "script.google.com" -and
  $parsedWebAppUrl.AbsolutePath.EndsWith("/exec")
if (-not $validWebAppUrl) {
  throw "WebAppUrl must be the raw https://script.google.com/.../exec address. Do not include Markdown brackets or link text."
}

Write-Host "Web app URL:" -ForegroundColor Cyan
Write-Host $WebAppUrl
Write-Host ""

Write-Host "Stopping any existing local server on port 3300..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }

$env:SHEET_WEBAPP_URL = $WebAppUrl
$secure = Read-Host "Paste PLANNER_TOKEN from Apps Script Script Properties" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:SHEET_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

Write-Host ""
Write-Host "Starting live bridge server. Leave this window open." -ForegroundColor Green
node .\src\server.js
