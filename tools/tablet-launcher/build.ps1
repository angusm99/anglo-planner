param(
 [Parameter(Mandatory=$true)][string]$Jdk,
 [Parameter(Mandatory=$true)][string]$BuildTools,
 [Parameter(Mandatory=$true)][string]$AndroidJar
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out=Join-Path $repo 'output\tablet-launcher'
$private=Join-Path $env:LOCALAPPDATA 'AngloWindows\FactoryLauncher'
New-Item -ItemType Directory -Force -Path $out,$private | Out-Null
function Run([string]$Exe,[string[]]$Arguments){ & $Exe @Arguments; if($LASTEXITCODE -ne 0){throw "Build command failed: $Exe"} }
$pass=Join-Path $private 'signing-password.local.txt'
$key=Join-Path $private 'signing-key.local.p12'
if(!(Test-Path -LiteralPath $key)){
 if(!(Test-Path -LiteralPath $pass)){[IO.File]::WriteAllText($pass,[Guid]::NewGuid().ToString('N'),[Text.UTF8Encoding]::new($false))}
 Run "$Jdk\bin\keytool.exe" @('-genkeypair','-keystore',$key,'-storepass:file',$pass,'-keypass:file',$pass,'-alias','factory-launcher','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Anglo Windows Factory Launcher')
}
foreach($station in @(4,8)){
 $work=Join-Path $out "build-$station"
 $classes=Join-Path $work 'classes'; $dex=Join-Path $work 'dex'; $res=Join-Path $work 'res'
 New-Item -ItemType Directory -Force -Path $work,$classes,$dex,"$res\drawable" | Out-Null
 Copy-Item -LiteralPath "$repo\public\icons\factory-terminal-192.png" -Destination "$res\drawable\icon.png"
 $manifest=@"
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="za.co.anglowindows.factory.station$station" android:versionCode="1" android:versionName="1.0">
<uses-sdk android:minSdkVersion="23" android:targetSdkVersion="35"/>
<application android:label="Station $station" android:icon="@drawable/icon" android:allowBackup="false" android:theme="@android:style/Theme.Material.NoActionBar">
<meta-data android:name="station" android:value="$station"/>
<activity android:name="za.co.anglowindows.factory.LauncherActivity" android:exported="true">
<intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
</activity></application></manifest>
"@
 [IO.File]::WriteAllText("$work\AndroidManifest.xml",$manifest,[Text.UTF8Encoding]::new($false))
 Run "$Jdk\bin\javac.exe" @('--release','8','-classpath',$AndroidJar,'-d',$classes,"$PSScriptRoot\LauncherActivity.java")
 Run "$Jdk\bin\jar.exe" @('cf',"$work\classes.jar",'-C',$classes,'.')
 Run "$Jdk\bin\java.exe" @('-cp',"$BuildTools\lib\d8.jar",'com.android.tools.r8.D8','--lib',$AndroidJar,'--min-api','23','--output',$dex,"$work\classes.jar")
 Run "$BuildTools\aapt.exe" @('package','-f','-M',"$work\AndroidManifest.xml",'-S',$res,'-I',$AndroidJar,'-F',"$work\unsigned.apk")
 Run "$Jdk\bin\jar.exe" @('uf',"$work\unsigned.apk",'-C',$dex,'classes.dex')
 Run "$BuildTools\zipalign.exe" @('-f','4',"$work\unsigned.apk","$work\aligned.apk")
 Run "$Jdk\bin\java.exe" @('-jar',"$BuildTools\lib\apksigner.jar",'sign','--ks',$key,'--ks-key-alias','factory-launcher','--ks-pass',"file:$pass",'--out',"$out\factory-station-$station.apk","$work\aligned.apk")
 Run "$Jdk\bin\java.exe" @('-jar',"$BuildTools\lib\apksigner.jar",'verify',"$out\factory-station-$station.apk")
 $permissions=& "$BuildTools\aapt.exe" dump permissions "$out\factory-station-$station.apk"
 if($LASTEXITCODE -ne 0 -or $permissions -match 'uses-permission'){throw 'Launcher must request no Android permissions'}
 Get-FileHash -LiteralPath "$out\factory-station-$station.apk" -Algorithm SHA256 | Select-Object Path,Hash
}
