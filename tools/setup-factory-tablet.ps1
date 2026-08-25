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
  [string]$DeviceLabel = "",

  [Parameter(Mandatory = $false)]
  [string]$WallpaperPath = "",

  [Parameter(Mandatory = $false)]
  [switch]$CleanDashboardOnly,

  [Parameter(Mandatory = $false)]
  [switch]$Cover,

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

function Disable-OptionalPackage {
  param([Parameter(Mandatory = $true)][string]$PackageName)

  $installed = Run-Adb @("shell", "cmd", "package", "list", "packages", $PackageName)
  if (($installed -join "`n") -notmatch [regex]::Escape($PackageName)) {
    Write-Host "Skipping missing package: $PackageName" -ForegroundColor DarkGray
    return
  }

  Write-Host "Disabling dashboard distraction: $PackageName" -ForegroundColor DarkGray
  Run-Adb @("shell", "pm", "disable-user", "--user", "0", $PackageName) | Out-Host
}

$Serial = Get-DeviceSerial
$baseUrl = "http://${PcIp}:${Port}"
$targetUrl = if ($Cover -and $Station -gt 0) { "$baseUrl/cover.html?station=$Station" } elseif ($Station -gt 0) { "$baseUrl/station/$Station" } else { "$baseUrl/" }

Write-Host "Factory Terminal tablet setup" -ForegroundColor Yellow
Write-Host "Device: $Serial"
Write-Host "URL:    $targetUrl"
if ($DeviceLabel) { Write-Host "Label:  $DeviceLabel" }
Write-Host ""

Write-Host "Checking tablet can see the planner PC..." -ForegroundColor Cyan
Run-Adb @("shell", "ping", "-c", "1", "-W", "2", $PcIp) | Out-Host

Write-Host "Applying factory-floor tablet settings..." -ForegroundColor Cyan
Run-Adb @("shell", "settings", "put", "global", "adb_allowed_connection_time", "0")
Run-Adb @("shell", "settings", "put", "global", "development_settings_enabled", "1")
Run-Adb @("shell", "settings", "put", "global", "adb_enabled", "1")
Run-Adb @("shell", "settings", "put", "global", "adb_wifi_enabled", "1")
Run-Adb @("shell", "settings", "put", "global", "stay_on_while_plugged_in", "3")
Run-Adb @("shell", "settings", "put", "global", "wifi_sleep_policy", "2")
Run-Adb @("shell", "settings", "put", "system", "screen_off_timeout", "2147483647")
Run-Adb @("shell", "settings", "put", "secure", "screensaver_enabled", "0")
Run-Adb @("shell", "settings", "put", "system", "accelerometer_rotation", "0")
Run-Adb @("shell", "settings", "put", "system", "user_rotation", "0")
if ($DeviceLabel) {
  $escapedLabel = $DeviceLabel.Replace("'", "'\''")
  Run-Adb @("shell", "settings put global device_name '$escapedLabel'")
  Run-Adb @("shell", "settings put secure bluetooth_name '$escapedLabel'")
}
Run-Adb @("shell", "input", "keyevent", "WAKEUP")
Run-Adb @("shell", "wm", "dismiss-keyguard")

if ($WallpaperPath) {
  $resolvedWallpaper = Resolve-Path -LiteralPath $WallpaperPath
  Write-Host "Copying wallpaper to tablet..." -ForegroundColor Cyan
  Run-Adb @("shell", "mkdir", "-p", "/sdcard/Pictures")
  & adb -s $Serial push $resolvedWallpaper.Path "/sdcard/Pictures/anglo-factory-wallpaper.jpg" | Out-Host
}

if ($CleanDashboardOnly) {
  Write-Host "Disabling weather and non-dashboard apps for the current Android user..." -ForegroundColor Cyan
  $dashboardDistractions = @(
    "com.htc.Weather",
    "com.htc.widget.weatherclock",
    "com.htc.android.worldclock",
    "com.htc.masthead",
    "com.google.android.googlequicksearchbox",
    "com.google.android.apps.googleassistant",
    "com.google.android.apps.turbo",
    "com.google.android.apps.wellbeing",
    "com.google.android.apps.safetyhub",
    "com.google.android.apps.books",
    "com.google.android.apps.docs",
    "com.google.android.apps.maps",
    "com.google.android.apps.photos",
    "com.google.android.apps.tachyon",
    "com.google.android.apps.youtube.music",
    "com.google.android.apps.youtube.kids",
    "com.google.android.youtube",
    "com.google.android.videos",
    "com.google.android.gm",
    "com.google.android.calendar",
    "com.google.android.keep",
    "com.google.android.projection.gearhead",
    "com.jlinksz.update"
  )
  foreach ($packageName in $dashboardDistractions) {
    Disable-OptionalPackage $packageName
  }
}

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
Run-Adb @("shell", "settings", "get", "global", "adb_allowed_connection_time") | ForEach-Object { "adb_allowed_connection_time=$_" }
Run-Adb @("shell", "settings", "get", "global", "adb_enabled") | ForEach-Object { "adb_enabled=$_" }
Run-Adb @("shell", "settings", "get", "global", "adb_wifi_enabled") | ForEach-Object { "adb_wifi_enabled=$_" }
Run-Adb @("shell", "settings", "get", "global", "development_settings_enabled") | ForEach-Object { "development_settings_enabled=$_" }
Run-Adb @("shell", "settings", "get", "global", "stay_on_while_plugged_in") | ForEach-Object { "stay_on_while_plugged_in=$_" }
Run-Adb @("shell", "settings", "get", "global", "wifi_sleep_policy") | ForEach-Object { "wifi_sleep_policy=$_" }
Run-Adb @("shell", "settings", "get", "system", "screen_off_timeout") | ForEach-Object { "screen_off_timeout=$_" }
Run-Adb @("shell", "settings", "get", "secure", "screensaver_enabled") | ForEach-Object { "screensaver_enabled=$_" }
Run-Adb @("shell", "settings", "get", "system", "accelerometer_rotation") | ForEach-Object { "accelerometer_rotation=$_" }
Run-Adb @("shell", "settings", "get", "system", "user_rotation") | ForEach-Object { "user_rotation=$_" }
Run-Adb @("shell", "settings", "get", "global", "device_name") | ForEach-Object { "device_name=$_" }
Run-Adb @("shell", "dumpsys", "activity", "activities") |
  Select-String -Pattern "mLockTaskModeState|Task\{.*com.android.chrome.*visible=true" |
  ForEach-Object { $_.Line.Trim() }

Write-Host ""
Write-Host "Done. If this is a new tablet, add the Chrome page to the home screen manually once:" -ForegroundColor Green
Write-Host "Chrome menu (three dots) -> Add to Home screen -> Factory Terminal - Anglo Windows"
