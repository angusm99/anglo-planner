// Native Settings shortcut only: no app install, pairing or debugging-state change.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const FACTORY_TABLETS = ['FS44BPC01070', 'FS44BPC00401', 'FS44BPC01356'];
const device = process.argv[2];
const serial = process.argv[3] || device;
assert.ok(FACTORY_TABLETS.includes(serial), 'Supply an approved Factory tablet serial');
const output = path.join(__dirname, '..', 'output');
const adb = args => execFileSync('adb', ['-s', device, ...args], { timeout: 12000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }).trim();
assert.equal(adb(['shell', 'getprop', 'ro.serialno']), serial, 'Tablet identity mismatch');
const before = { serial, tiles: adb(['shell', 'settings', 'get', 'secure', 'sysui_qs_tiles']), debugging: adb(['shell', 'settings', 'get', 'global', 'adb_wifi_enabled']) };
const backup = path.join(output, `${serial}-before-maintenance-tile.local.json`);
if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(before, null, 2), { flag: 'wx' });
function nodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
}
function snapshot(step) {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/factory-maintenance.xml']);
  const xml = adb(['shell', 'cat', '/sdcard/factory-maintenance.xml']);
  fs.writeFileSync(path.join(output, `${serial}-maintenance-${step}.local.xml`), xml);
  return { xml, nodes: nodes(xml) };
}
function center(node) {
  const numbers = node.bounds.match(/\d+/g).map(Number);
  assert.equal(numbers.length, 4);
  assert.ok(numbers[2] > numbers[0] && numbers[3] > numbers[1], 'Control not visible');
  return [Math.round((numbers[0] + numbers[2]) / 2), Math.round((numbers[1] + numbers[3]) / 2)];
}
function tap(node) { adb(['shell', 'input', 'tap', ...center(node).map(String)]); }
adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
adb(['shell', 'wm', 'dismiss-keyguard']);
adb(['shell', 'cmd', 'statusbar', 'collapse']);
if (!before.tiles.includes('DevelopmentTiles$WirelessDebugging')) {
  adb(['shell', 'am', 'start', '-a', 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS']);
  let quickSettings;
  for (let page = 0; page < 6; page++) {
    quickSettings = snapshot(`developer-${page}`).nodes.find(n => n.text === 'Quick settings developer tiles' && n.bounds !== '[0,0][0,0]');
    if (quickSettings) break;
    adb(['shell', 'input', 'swipe', '500', '1100', '500', '500', '500']);
  }
  assert.ok(quickSettings, 'Quick settings developer tiles not found; no setting changed');
  tap(quickSettings);
  const list = snapshot('tile-options').nodes;
  const index = list.findIndex(n => n.text === 'Wireless debugging');
  assert.ok(index >= 0, 'Native Wireless debugging shortcut unavailable');
  const toggle = list.slice(index + 1, index + 7).find(n => n.class === 'android.widget.Switch');
  assert.ok(toggle, 'Wireless debugging shortcut switch unavailable');
  if (toggle.checked !== 'true') tap(list[index]);
}
const tiles = adb(['shell', 'settings', 'get', 'secure', 'sysui_qs_tiles']);
assert.ok(tiles.includes('DevelopmentTiles$WirelessDebugging'), 'Shortcut was not added');
for (const tile of before.tiles.split(',')) if (tile && before.tiles !== 'null') assert.ok(tiles.split(',').includes(tile), 'Existing quick setting removed');
assert.equal(adb(['shell', 'settings', 'get', 'global', 'adb_wifi_enabled']), before.debugging, 'Debugging state changed');
adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
let tile;
for (let attempt = 0; attempt < 3; attempt++) {
  adb(['shell', 'cmd', 'statusbar', 'expand-settings']);
  tile = snapshot('quick-settings').nodes.find(n => n['content-desc'] === 'Wireless debugging' && n['long-clickable'] === 'true');
  if (tile) break;
}
assert.ok(tile, 'Shortcut not visible in Quick Settings');
fs.writeFileSync(path.join(output, `${serial}-maintenance-quick-settings.png`), execFileSync('adb', ['-s', device, 'exec-out', 'screencap', '-p'], { timeout: 12000, maxBuffer: 8 * 1024 * 1024 }));
const [x, y] = center(tile);
adb(['shell', 'input', 'swipe', String(x), String(y), String(x), String(y), '1300']);
assert.ok(snapshot('target').nodes.some(n => n.text === 'Use wireless debugging'), 'Long press did not open Wireless debugging settings');
assert.equal(adb(['shell', 'settings', 'get', 'global', 'adb_wifi_enabled']), before.debugging);
adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
const result = { serial, installed: true, tileLabel: 'Wireless debugging', longPressOpensCorrectSettings: true, debuggingStatePreserved: before.debugging, previousTilesPreserved: true, checkedAt: new Date().toISOString() };
fs.writeFileSync(path.join(output, `${serial}-maintenance-shortcut-result.local.json`), JSON.stringify(result, null, 2));
adb(['shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main']);
console.log(JSON.stringify(result));
