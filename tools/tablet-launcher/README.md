# Factory station launcher

A small native launcher for the existing Chrome terminal, not a WebView or a second terminal app. Chrome Custom Tabs provides the yellow title/status bar and a single page without normal browser tab controls. The cover, operator page, cutting viewer, cookies and all production actions remain in Chrome at `http://192.168.0.84:3300`.

Two fixed builds: `za.co.anglowindows.factory.station4` (FS44BPC01070) and `za.co.anglowindows.factory.station8` (FS44BPC01356). Never install on Site tablets. Station5's existing Chrome WebappActivity is retained. Apps request no Android permissions, save no files, run no service and make no direct network requests. Chrome still offers its menu and Android navigation; this is not Android device-owner kiosk mode. The minimize control may remain browser-provided.

`LauncherActivity.java` supplies the standard null Custom Tabs session binder, toolbar color, title and hidden close/share controls, using only Android SDK APIs. The fixed station comes from packaged metadata, never an external URL/intent parameter. The launcher stays beneath Chrome so Home/reopen restores the task instead of creating another page. When Chrome exits, the empty launcher closes.

Build from Windows PowerShell using a portable JDK21, Android build-tools35 and the Android35 platform jar:

```powershell
.\tools\tablet-launcher\build.ps1 -Jdk '<JDK folder>' -BuildTools '<build-tools folder>' -AndroidJar '<android.jar>'
```

The build verifies APK signatures and asserts zero requested permissions. Output is `output\tablet-launcher\factory-station-{4,8}.apk`; verified release copies are in `tools\tablet-launcher\apk`. Build tools were downloaded from Google Android repository metadata and Microsoft OpenJDK, with published archive checksums verified. Portable build cache: `%TEMP%\factory-launcher-build`; no JDK/SDK was installed globally.

Signing key/password are local-only under `%LOCALAPPDATA%\AngloWindows\FactoryLauncher`. Preserve these private files for compatible updates; never commit them. Losing the key requires replacing the launcher APK, but must never be handled by clearing Chrome data.

For deployment, run fresh `adb mdns services`, serial-verify `ro.serialno`, then `adb -s <verified endpoint> install -r <matching APK>`, each with a hard timeout. Launch the app from the app drawer and place its real app icon on Home; remove only the old Chrome Home shortcut, not Chrome/site data. Confirm the URL and station, yellow toolbar, absence of New tab/Close tab controls, primary operator and real job list. Test Home/reopen without increasing page count and without staged work. No server restart, Chrome downgrade, insecure-origin flag, certificate or firewall change is required.

Verified27October2026: Station4 installed and real Home icon pinned; older Chrome shortcuts removed. Brian,13jobs,queue0, D3266 five-page cutting list and close, Home/reopen same page count, gold toolbar and no normal tab/close controls. Station8 APK installed/opened; Angus confirmed Stations5/8 working and requested no further changes there. Station4 final screenshot is in source `output/station4-yellow-operation.png` and the canonical Factory help pack. Reboot recovery was not tested.

Canonical handoff: `C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\Factory Terminal - Station Dashboards.md`.
