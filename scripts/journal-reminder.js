#!/usr/bin/env node
// scripts/journal-reminder.js
//
// Desktop journal reminder that works with Meridian CLOSED.
//
// A browser can't wake itself up every few hours once its tabs are closed, so
// the in-app reminders only fire while Meridian is open. This helper is the
// other half: a tiny, dependency-free script that the operating system's own
// scheduler runs every N hours. Each run it decides whether to nudge you and,
// if so, shows a native desktop notification with the Meridian icon.
//
//   node scripts/journal-reminder.js              run once (what the scheduler calls)
//   node scripts/journal-reminder.js --test       show a notification right now
//   node scripts/journal-reminder.js --status     explain what a run would do, and why
//   node scripts/journal-reminder.js --install    schedule it with the OS (--dry-run to preview)
//   node scripts/journal-reminder.js --uninstall  remove the schedule
//
// Options (flags beat .env/.env.local, which beat defaults):
//   --every N   hours between reminders             JOURNAL_REMINDER_EVERY_HOURS  (3)
//   --start H   no reminders before this local hour JOURNAL_REMINDER_START_HOUR   (9)
//   --end H     none at/after this local hour       JOURNAL_REMINDER_END_HOUR     (21)
//   --url URL   what clicking the notification opens MERIDIAN_URL (http://localhost:3000)
//
// "Skip if I just wrote": with the local data provider the helper reads
// data/db.local.json and stays quiet if you wrote something in the last N
// hours. With Supabase it can't see your entries, so it always nudges.
//
// Every run appends one line to data/journal-reminder.log — scheduled runs are
// invisible, so that's where to look if a notification never shows up.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ICON = path.join(ROOT, 'public', 'icons', 'icon-192.png');
const LOG_FILE = path.join(ROOT, 'data', 'journal-reminder.log');
const HOUR_MS = 3_600_000;

const TASK_NAME = 'Meridian Journal Reminder'; // Windows Task Scheduler
const LAUNCHD_LABEL = 'com.meridian.journal-reminder'; // macOS
const CRON_MARK = '# meridian-journal-reminder'; // Linux crontab
// PowerShell's own AppUserModelID. Windows only shows toasts from an app it
// recognises; borrowing this one works without registering anything. The
// catch: Windows labels the toast "Windows PowerShell" in its header.
const WIN_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

const PROMPTS = [
  'What’s on your mind? Dump it here before it slips.',
  'Any wins, worries or half-ideas since your last note?',
  'Two minutes: what did you just finish, and what’s nagging you?',
  'Get it out of your head and into the journal.',
];

// ---------------------------------------------------------------- config ---

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).trim();
    if (['every', 'start', 'end', 'url', 'platform'].includes(key)) {
      out[key] = eq === -1 ? argv[++i] : a.slice(eq + 1);
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** Minimal KEY=VALUE reader for .env files. Never overrides real environment variables. */
function loadEnvFiles(env = process.env) {
  for (const name of ['.env.local', '.env']) {
    let text;
    try { text = fs.readFileSync(path.join(ROOT, name), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, '');
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}

function int(raw, min, max, fallback) {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function getConfig(args, env) {
  const url = String(args.url || env.MERIDIAN_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    every: int(args.every ?? env.JOURNAL_REMINDER_EVERY_HOURS, 1, 24, 3),
    start: int(args.start ?? env.JOURNAL_REMINDER_START_HOUR, 0, 23, 9),
    end: int(args.end ?? env.JOURNAL_REMINDER_END_HOUR, 0, 23, 21),
    url,
    journalUrl: `${url}/journal?focus=1`,
  };
}

// -------------------------------------------------------------- decision ---

/** Same rule as src/features/journal/reminders.ts, read in the machine's local time. */
function inWindow(date, start, end) {
  const h = date.getHours();
  if (start === end) return true;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** Latest write/edit time (ms) from the local JSON database, or null if unknown. */
function lastActivityFromLocalDb(env, dbPath = path.join(ROOT, 'data', 'db.local.json')) {
  if ((env.DATA_PROVIDER || 'local') !== 'local') return null;
  try {
    const rows = JSON.parse(fs.readFileSync(dbPath, 'utf8')).journal_entries || [];
    let best = null;
    for (const r of rows) {
      const t = Math.max(Date.parse(r.created_at) || 0, Date.parse(r.updated_at) || 0);
      if (t && (best === null || t > best)) best = t;
    }
    return best;
  } catch {
    return null; // missing/unreadable/mid-write: can't tell, so don't suppress
  }
}

function decide({ now, cfg, lastActivity, force }) {
  if (force) return { fire: true, reason: 'forced' };
  if (!inWindow(now, cfg.start, cfg.end)) {
    return { fire: false, reason: `outside active hours (${cfg.start}:00-${cfg.end}:00, it is ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')})` };
  }
  if (lastActivity !== null && now.getTime() - lastActivity < cfg.every * HOUR_MS) {
    const mins = Math.round((now.getTime() - lastActivity) / 60000);
    return { fire: false, reason: `you wrote ${mins} min ago (< ${cfg.every}h)` };
  }
  return { fire: true, reason: lastActivity === null ? 'in window; no recent entry on record' : 'in window; nothing written recently' };
}

// ------------------------------------------------------- notifications -----

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** PowerShell source for a Windows toast. Pure — returns a string. */
function buildToastScript({ title, body, url, iconPath }) {
  const iconUri = 'file:///' + String(iconPath).replace(/\\/g, '/');
  const xml =
    `<toast activationType="protocol" launch="${xmlEscape(url)}"><visual><binding template="ToastGeneric">` +
    `<image placement="appLogoOverride" src="${xmlEscape(iconUri)}"/>` +
    `<text>${xmlEscape(title)}</text><text>${xmlEscape(body)}</text>` +
    `</binding></visual><audio silent="true"/></toast>`;
  return [
    '$ErrorActionPreference = \'Stop\'',
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    `$xml = @'\r\n${xml}\r\n'@`,
    '$doc = New-Object Windows.Data.Xml.Dom.XmlDocument',
    '$doc.LoadXml($xml)',
    '$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${WIN_APP_ID}').Show($toast)`,
  ].join('\r\n');
}

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

/** Write a PowerShell script (UTF-8 *with BOM*, or Windows PowerShell 5 reads it as ANSI) and run it. */
function runPowerShell(source) {
  const file = path.join(os.tmpdir(), `meridian-${process.pid}-${Date.now()}.ps1`);
  fs.writeFileSync(file, '\ufeff' + source, 'utf8');
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file], {
      encoding: 'utf8', windowsHide: true,
    });
    if (r.error) return { ok: false, error: r.error.message };
    return r.status === 0 ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || `exit ${r.status}`).trim() };
  } finally {
    try { fs.unlinkSync(file); } catch { /* temp file, best effort */ }
  }
}

function notify({ title, body, url }, platform = process.platform) {
  if (platform === 'win32') {
    return runPowerShell(buildToastScript({ title, body, url, iconPath: ICON }));
  }
  if (platform === 'darwin') {
    // terminal-notifier (brew install terminal-notifier) supports a click action and an icon.
    // Plain osascript notifications do neither — clicking one opens Script Editor.
    if (which('terminal-notifier')) {
      const r = spawnSync('terminal-notifier', ['-title', title, '-message', body, '-open', url, '-appIcon', ICON, '-group', 'meridian-journal'], { encoding: 'utf8' });
      return r.status === 0 ? { ok: true } : { ok: false, error: (r.stderr || '').trim() || `exit ${r.status}` };
    }
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const r = spawnSync('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}"`], { encoding: 'utf8' });
    return r.status === 0 ? { ok: true, note: 'osascript has no icon or click action; install terminal-notifier for both' } : { ok: false, error: (r.stderr || '').trim() || `exit ${r.status}` };
  }
  if (!which('notify-send')) return { ok: false, error: 'notify-send not found (install libnotify-bin / libnotify)' };
  const r = spawnSync('notify-send', ['-a', 'Meridian', '-i', ICON, '-u', 'low', '-t', '15000', title, `${body}\n${url}`], { encoding: 'utf8' });
  return r.status === 0 ? { ok: true } : { ok: false, error: (r.stderr || '').trim() || `exit ${r.status}` };
}

// --------------------------------------------------- scheduling (install) ---

function psq(s) { return String(s).replace(/'/g, "''"); } // PowerShell single-quote escape

/** The command line the scheduler runs. `--every` is always baked in so the
 *  schedule and the skip threshold can't drift apart; the rest only if given. */
function scheduledArgs(cfg, args) {
  const out = ['--every', String(cfg.every)];
  if (args.start !== undefined) out.push('--start', String(cfg.start));
  if (args.end !== undefined) out.push('--end', String(cfg.end));
  if (args.url !== undefined) out.push('--url', cfg.url);
  return out;
}

function winLauncherPath() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Meridian', 'journal-reminder.vbs');
}

/** A .vbs wrapper so Task Scheduler runs node with no console window flashing up. */
function buildVbs(nodePath, scriptPath, extraArgs) {
  const cmd = [nodePath, scriptPath].map((p) => `"${p}"`).concat(extraArgs.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a))).join(' ');
  return `' Generated by scripts/journal-reminder.js - runs the reminder with no visible window.\r\n` +
    `Set sh = CreateObject("WScript.Shell")\r\n` +
    `sh.CurrentDirectory = "${ROOT.replace(/"/g, '""')}"\r\n` +
    `sh.Run "${cmd.replace(/"/g, '""')}", 0, False\r\n`;
}

function buildTaskScript(vbsPath, everyHours) {
  // schtasks.exe would be simpler, but tasks it creates refuse to run on battery power,
  // which on a laptop means "never". Register-ScheduledTask lets us turn that off.
  return [
    '$ErrorActionPreference = \'Stop\'',
    `$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '//B //Nologo "${psq(vbsPath)}"'`,
    `$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours ${everyHours}) -RepetitionDuration (New-TimeSpan -Days 9999)`,
    '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable',
    `Register-ScheduledTask -TaskName '${psq(TASK_NAME)}' -Action $action -Trigger $trigger -Settings $settings -Description 'Meridian journal reminder (scripts/journal-reminder.js)' -Force | Out-Null`,
  ].join('\r\n');
}

function plistPath() { return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`); }

function buildPlist(nodePath, scriptPath, extraArgs, everyHours) {
  const items = [nodePath, scriptPath, ...extraArgs].map((a) => `    <string>${xmlEscape(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${items}
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(ROOT)}</string>
  <key>StartInterval</key><integer>${everyHours * 3600}</integer>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
}

function buildCronLine(nodePath, scriptPath, extraArgs, everyHours, uid) {
  const hours = everyHours === 1 ? '*' : `*/${everyHours}`;
  const cmd = [nodePath, scriptPath].map((p) => `"${p}"`).concat(extraArgs.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a))).join(' ');
  // cron's environment is bare; notify-send needs the user's D-Bus session to reach the desktop.
  return `0 ${hours} * * * DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${uid}/bus ${cmd.replace(/%/g, '\\%')} ${CRON_MARK}`;
}

function install(cfg, args, platform, dry) {
  const node = process.execPath;
  const script = __filename;
  const extra = scheduledArgs(cfg, args);
  const say = (m) => console.log(m);

  if (platform === 'win32') {
    const vbs = winLauncherPath();
    const task = buildTaskScript(vbs, cfg.every);
    if (dry) {
      say(`[dry-run] would write ${vbs}:\n${buildVbs(node, script, extra)}`);
      say(`[dry-run] would run in PowerShell:\n${task}`);
      return true;
    }
    fs.mkdirSync(path.dirname(vbs), { recursive: true });
    fs.writeFileSync(vbs, buildVbs(node, script, extra), 'utf8');
    const r = runPowerShell(task);
    if (!r.ok) { console.error(`Could not register the scheduled task: ${r.error}`); return false; }
    say(`Scheduled "${TASK_NAME}" every ${cfg.every}h in Task Scheduler (runs only while you're signed in).`);
    return true;
  }

  if (platform === 'darwin') {
    const file = plistPath();
    const plist = buildPlist(node, script, extra, cfg.every);
    if (dry) { say(`[dry-run] would write ${file}:\n${plist}\n[dry-run] then: launchctl unload/load -w ${file}`); return true; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, plist, 'utf8');
    spawnSync('launchctl', ['unload', file], { stdio: 'ignore' });
    const r = spawnSync('launchctl', ['load', '-w', file], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`launchctl load failed: ${(r.stderr || '').trim()}`); return false; }
    say(`Scheduled ${LAUNCHD_LABEL} every ${cfg.every}h via launchd (${file}).`);
    return true;
  }

  const line = buildCronLine(node, script, extra, cfg.every, typeof process.getuid === 'function' ? process.getuid() : 1000);
  if (dry) { say(`[dry-run] would add this line to your crontab (replacing any previous Meridian line):\n${line}`); return true; }
  if (!which('crontab')) { console.error('crontab not found - add this line to a scheduler of your choice:\n' + line); return false; }
  const cur = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  const kept = (cur.status === 0 ? cur.stdout : '').split('\n').filter((l) => l.trim() && !l.includes(CRON_MARK));
  const w = spawnSync('crontab', ['-'], { input: [...kept, line].join('\n') + '\n', encoding: 'utf8' });
  if (w.status !== 0) { console.error(`crontab update failed: ${(w.stderr || '').trim()}`); return false; }
  say(`Added a crontab entry: every ${cfg.every}h.`);
  return true;
}

function uninstall(platform, dry) {
  if (platform === 'win32') {
    const vbs = winLauncherPath();
    const ps = `Unregister-ScheduledTask -TaskName '${psq(TASK_NAME)}' -Confirm:$false -ErrorAction SilentlyContinue`;
    if (dry) { console.log(`[dry-run] would run: ${ps}\n[dry-run] would delete ${vbs}`); return true; }
    runPowerShell(ps);
    try { fs.unlinkSync(vbs); } catch { /* already gone */ }
    console.log('Removed the scheduled task.');
    return true;
  }
  if (platform === 'darwin') {
    const file = plistPath();
    if (dry) { console.log(`[dry-run] would run: launchctl unload ${file}, then delete it`); return true; }
    spawnSync('launchctl', ['unload', file], { stdio: 'ignore' });
    try { fs.unlinkSync(file); } catch { /* already gone */ }
    console.log('Removed the launchd job.');
    return true;
  }
  if (dry) { console.log(`[dry-run] would remove crontab lines containing "${CRON_MARK}"`); return true; }
  if (!which('crontab')) { console.log('No crontab available - nothing to remove.'); return true; }
  const cur = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  if (cur.status === 0) {
    const kept = cur.stdout.split('\n').filter((l) => l.trim() && !l.includes(CRON_MARK));
    spawnSync('crontab', ['-'], { input: kept.length ? kept.join('\n') + '\n' : '', encoding: 'utf8' });
    if (!kept.length) spawnSync('crontab', ['-r'], { stdio: 'ignore' });
  }
  console.log('Removed the crontab entry.');
  return true;
}

// ------------------------------------------------------------------- main ---

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()}  ${line}\n`);
    if (fs.statSync(LOG_FILE).size > 50_000) {
      fs.writeFileSync(LOG_FILE, fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-100).join('\n'));
    }
  } catch { /* logging must never break a run */ }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnvFiles({ ...process.env });
  const cfg = getConfig(args, env);
  const dry = Boolean(args['dry-run']);
  // --platform only exists so --dry-run can preview another OS's plan.
  const platform = dry && args.platform ? String(args.platform) : process.platform;

  if (args.help || args.h) {
    const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(2); // skip shebang + filename line
    const header = [];
    for (const l of lines) { if (!l.startsWith('//')) break; header.push(l.replace(/^\/\/ ?/, '')); }
    console.log(header.join('\n'));
    return 0;
  }

  if (args.uninstall) return uninstall(platform, dry) ? 0 : 1;

  if (args.install) {
    if (!install(cfg, args, platform, dry)) return 1;
    if (dry) return 0;
    console.log(`Window: ${cfg.start}:00-${cfg.end}:00 local time. Clicking a reminder opens ${cfg.journalUrl}`);
    console.log('Sending a test notification now so you can see it works...');
    const r = notify({ title: 'Meridian · Journal', body: 'Reminders are set up. This is what they will look like.', url: cfg.journalUrl });
    console.log(r.ok ? 'Sent. (Nothing on screen? Check Focus assist / Do Not Disturb, then see data/journal-reminder.log.)' : `Test notification failed: ${r.error}`);
    return r.ok ? 0 : 1;
  }

  const now = new Date();
  const lastActivity = lastActivityFromLocalDb(env);
  const verdict = decide({ now, cfg, lastActivity, force: Boolean(args.test || args.force) });

  if (args.status) {
    console.log(`Every ${cfg.every}h, ${cfg.start}:00-${cfg.end}:00 local time -> ${cfg.journalUrl}`);
    console.log(`Last journal activity: ${lastActivity ? new Date(lastActivity).toLocaleString() : 'unknown (Supabase, or no entries yet)'}`);
    console.log(`A run right now would ${verdict.fire ? 'SHOW a reminder' : 'stay quiet'}: ${verdict.reason}`);
    return 0;
  }

  if (!verdict.fire) { log(`skip: ${verdict.reason}`); return 0; }

  const body = PROMPTS[Math.floor(now.getTime() / HOUR_MS) % PROMPTS.length];
  const r = notify({ title: 'Meridian · Journal', body, url: cfg.journalUrl }, platform);
  log(r.ok ? `shown (${verdict.reason})` : `FAILED: ${r.error}`);
  if (!r.ok) { console.error(`Could not show a notification: ${r.error}`); return 1; }
  if (r.note) console.log(r.note);
  return 0;
}

module.exports = {
  parseArgs, getConfig, inWindow, lastActivityFromLocalDb, decide, xmlEscape,
  buildToastScript, buildVbs, buildTaskScript, buildPlist, buildCronLine, scheduledArgs,
};

if (require.main === module) process.exit(main());
