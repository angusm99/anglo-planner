param(
  [Parameter(Mandatory = $false)]
  [string]$Serial,

  [Parameter(Mandatory = $false)]
  [string]$PcIp = "192.168.0.84",

  [Parameter(Mandatory = $false)]
  [int]$Port = 3300,

  [Parameter(Mandatory = $false)]
  [ValidateRange(0, 8)]
  [int]$Station = 0,

  [Parameter(Mandatory = $false)]
  [switch]$NoPin
)

$ErrorActionPreference = "Stop"

function Run-Adb {
  param([Parameter(Mandatory = $true)][string[]]$AdbArgs)
  if ($Serial) {
    & adb -s $Serial @AdbArgs
  } else {
    & adb @AdbArgs
  }
}

function Get-DeviceSerial {
  $devices = & adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" }
  if ($Serial) { return $Serial }
  if ($devices.Count -eq 1) { return (($devices[0] -split "\s+")[0]) }
  throw "Connect exactly one tablet or pass -Serial <device serial>. Current adb devices:`n$($devices -join "`n")"
}

$Serial = Get-DeviceSerial
$baseUrl = "http://${PcIp}:${Port}"
$targetUrl = if ($Station -gt 0) { "$baseUrl/station/$Station" } else { "$baseUrl/" }

Write-Host "Factory Terminal tablet setup" -ForegroundColor Yellow
Write-Host "Device: $Serial"
Write-Host "URL:    $targetUrl"
Write-Host ""

Write-Host "Checking tablet can see the planner PC..." -ForegroundColor Cyan
Run-Adb @("shell", "ping", "-c", "1", "-W", "2", $PcIp) | Out-Host

Write-Host "Applying factory-floor tablet settings..." -ForegroundColor Cyan
Run-Adb @("shell", "settings", "put", "global", "stay_on_while_plugged_in", "3")
Run-Adb @("shell", "settings", "put", "global", "wifi_sleep_policy", "2")
Run-Adb @("shell", "settings", "put", "system", "screen_off_timeout", "2147483647")
Run-Adb @("shell", "input", "keyevent", "WAKEUP")
Run-Adb @("shell", "wm", "dismiss-keyguard")

Write-Host "Opening Factory Terminal in Chrome..." -ForegroundColor Cyan
$openResult = Run-Adb @("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", $targetUrl, "com.android.chrome")
$alreadyPinned = ($openResult -join "`n") -match "unknown error code 101"
if ($alreadyPinned) {
  Write-Host "Chrome is already pinned; Android ignored the new open request. Continuing with the visible pinned task." -ForegroundColor DarkYellow
} else {
  $openResult | Out-Host
}
Start-Sleep -Seconds 3

if (-not $NoPin) {
  Write-Host "Pinning Chrome to keep staff on the terminal..." -ForegroundColor Cyan
  $activity = Run-Adb @("shell", "dumpsys", "activity", "activities")
  $taskLine = $activity | Select-String -Pattern "Task\{.*#(\d+).*com.android.chrome.*visible=true" | Select-Object -First 1
  if (-not $taskLine) {
    Write-Warning "Could not find the visible Chrome task. The page opened, but pinning was skipped."
  } else {
    $taskId = [regex]::Match($taskLine.Line, "#(\d+)").Groups[1].Value
    Run-Adb @("shell", "am", "task", "lock", $taskId) | Out-Host
  }
}

Write-Host ""
Write-Host "Verifying state..." -ForegroundColor Cyan
Run-Adb @("shell", "settings", "get", "global", "stay_on_while_plugged_in") | ForEach-Object { "stay_on_while_plugged_in=$_" }
Run-Adb @("shell", "settings", "get", "global", "wifi_sleep_policy") | ForEach-Object { "wifi_sleep_policy=$_" }
Run-Adb @("shell", "settings", "get", "system", "screen_off_timeout") | ForEach-Object { "screen_off_timeout=$_" }
Run-Adb @("shell", "dumpsys", "activity", "activities") |
  Select-String -Pattern "mLockTaskModeState|Task\{.*com.android.chrome.*visible=true" |
  ForEach-Object { $_.Line.Trim() }

Write-Host ""
Write-Host "Done. If this is a new tablet, add the Chrome page to the home screen manually once:" -ForegroundColor Green
Write-Host "Chrome menu (three dots) -> Add to Home screen -> Factory Terminal - Anglo Windows"
