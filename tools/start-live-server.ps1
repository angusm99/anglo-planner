param(
  [Parameter(Mandatory = $false)]
  [string]$WebAppUrl,

  # Forces a fresh token prompt even if one is already stored (use after rotating the token).
  [switch]$ResetToken
)

$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $Repo

# Windows Credential Manager access via the native Win32 API — no extra module needed.
# Stored once as a machine-persisted generic credential so PLANNER_TOKEN never has to be
# typed (or handed to anything else) on every restart.
$CredTarget = "AngloPlannerToken"
if (-not ([System.Management.Automation.PSTypeName]'AngloPlanner.CredMan').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace AngloPlanner {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  public static class CredMan {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr cred);
  }
}
'@
}

function Get-StoredPlannerToken {
  $ptr = [IntPtr]::Zero
  $ok = [AngloPlanner.CredMan]::CredRead($CredTarget, 1, 0, [ref]$ptr) # 1 = CRED_TYPE_GENERIC
  if (-not $ok) { return $null }
  try {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][AngloPlanner.CREDENTIAL])
    if ($cred.CredentialBlobSize -le 0) { return $null }
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
    return [Text.Encoding]::Unicode.GetString($bytes)
  } finally {
    [AngloPlanner.CredMan]::CredFree($ptr)
  }
}

function Set-StoredPlannerToken {
  param([Parameter(Mandatory = $true)][string]$PlainToken)
  $bytes = [Text.Encoding]::Unicode.GetBytes($PlainToken)
  $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try {
    [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
    $cred = New-Object AngloPlanner.CREDENTIAL
    $cred.Type = 1              # CRED_TYPE_GENERIC
    $cred.TargetName = $CredTarget
    $cred.CredentialBlobSize = [uint32]$bytes.Length
    $cred.CredentialBlob = $blob
    $cred.Persist = 2           # CRED_PERSIST_LOCAL_MACHINE — survives reboot, this Windows account only
    $cred.UserName = "planner"
    if (-not [AngloPlanner.CredMan]::CredWrite([ref]$cred, 0)) {
      throw "Could not save to Windows Credential Manager (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
  }
}

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

$storedToken = if ($ResetToken) { $null } else { Get-StoredPlannerToken }
if ($storedToken) {
  Write-Host "Using PLANNER_TOKEN from Windows Credential Manager (run with -ResetToken to change it)." -ForegroundColor DarkGray
  $env:SHEET_TOKEN = $storedToken
} else {
  $secure = Read-Host "Paste PLANNER_TOKEN from Apps Script Script Properties" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $env:SHEET_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  $save = Read-Host "Save this token to Windows Credential Manager so future restarts skip this prompt? (y/N)"
  if ($save -eq "y" -or $save -eq "Y") {
    Set-StoredPlannerToken -PlainToken $env:SHEET_TOKEN
    Write-Host "Saved. Future runs of this script won't ask for the token." -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Starting live bridge server. Leave this window open." -ForegroundColor Green
node .\src\server.js
