const GOOGLE_CLIENT_ID = '641961724620-kdn509cn2jo2pj7kplrtg2orv8l2a7b3.apps.googleusercontent.com';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_DRIVE_FOLDER = 'OrionStudy';
const GOOGLE_DRIVE_FILE = 'orionstudy-backup.json';
const ORION_KEYS = ['orion_v4', 'orion_lib_v2', 'gran_cron_v2', 'gran_import', 'orion_theme'];
const ORION_LAST_BACKUP = 'orion_last_backup';
const ORION_BACKUP_DISMISSED = 'orion_backup_dismissed';
const ORION_LAST_GDRIVE_BACKUP = 'orion_last_gdrive_backup';
const ORION_GDRIVE_CONNECTED = 'orion_gdrive_connected';
const ORION_BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000;
const ORION_DISMISS_INTERVAL = 12 * 60 * 60 * 1000;
const ORION_GDRIVE_INTERVAL = 12 * 60 * 60 * 1000;

let orionGoogleTokenClient = null;
let orionGoogleAccessToken = null;
let orionGoogleScriptPromise = null;

try {
  const theme = localStorage.getItem('orion_theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch (e) {}

function orionBuildExport() {
  const dump = { _app: 'OrionStudy', _version: 1, _exportedAt: new Date().toISOString(), data: {} };
  const keys = new Set(ORION_KEYS);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /^(orion|gran)/.test(key) && key !== ORION_LAST_BACKUP && key !== ORION_BACKUP_DISMISSED) {
      keys.add(key);
    }
  }
  keys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value === null) return;
    try { dump.data[key] = JSON.parse(value); } catch (e) { dump.data[key] = value; }
  });
  return Object.keys(dump.data).length ? dump : null;
}

function orionExport() {
  const dump = orionBuildExport();
  if (!dump) {
    alert('Nenhum progresso encontrado neste navegador para exportar.\n\nClique em Backup a partir da MESMA página/navegador onde você usa o OrionStudy — o progresso fica salvo por origem (arquivo local vs. site publicado vs. localhost) e não passa de uma pra outra.');
    return false;
  }
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orionstudy-progresso-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  try { localStorage.setItem(ORION_LAST_BACKUP, new Date().toISOString()); } catch (e) {}
  return true;
}

function orionLoadGoogleScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (orionGoogleScriptPromise) return orionGoogleScriptPromise;
  orionGoogleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Identity Services.'));
    document.head.appendChild(script);
  });
  return orionGoogleScriptPromise;
}

function orionDriveIsConfigured() {
  return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'SEU_CLIENT_ID_AQUI';
}

function orionDriveIsConnected() {
  try { return localStorage.getItem(ORION_GDRIVE_CONNECTED) === '1'; } catch (e) { return false; }
}

function orionDriveSetStatus(message) {
  const status = document.getElementById('orion-gdrive-status');
  if (status) status.textContent = message;
}

function orionDriveLastBackupText() {
  try {
    const value = localStorage.getItem(ORION_LAST_GDRIVE_BACKUP);
    if (!value) return '';
    return ` · último backup: ${new Date(value).toLocaleString('pt-BR')}`;
  } catch (e) { return ''; }
}

function orionInitGoogleTokenClient() {
  if (!orionDriveIsConfigured()) throw new Error('Configure GOOGLE_CLIENT_ID no shared.js antes de conectar o Google Drive.');
  if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services ainda não está disponível.');
  if (!orionGoogleTokenClient) {
    orionGoogleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: response => {
        if (response.error) {
          orionGoogleAccessToken = null;
          console.warn('[OrionStudy] autorização do Google Drive falhou:', response.error);
          return;
        }
        orionGoogleAccessToken = response.access_token;
        try { localStorage.setItem(ORION_GDRIVE_CONNECTED, '1'); } catch (e) {}
        orionDriveSetStatus(`Google Drive conectado ✓${orionDriveLastBackupText()}`);
      }
    });
  }
  return orionGoogleTokenClient;
}

function orionGetGoogleAccessToken(interactive) {
  return new Promise((resolve, reject) => {
    try {
      const client = orionInitGoogleTokenClient();
      client.callback = response => {
        if (response.error) {
          orionGoogleAccessToken = null;
          reject(new Error(response.error));
          return;
        }
        orionGoogleAccessToken = response.access_token;
        try { localStorage.setItem(ORION_GDRIVE_CONNECTED, '1'); } catch (e) {}
        resolve(response.access_token);
      };
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (error) { reject(error); }
  });
}

async function orionDriveRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${orionGoogleAccessToken}`, ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function orionBackupToGoogleDrive(options = {}) {
  const dump = orionBuildExport();
  if (!dump) return false;
  if (!orionDriveIsConfigured()) throw new Error('Configure GOOGLE_CLIENT_ID no shared.js antes de usar o Google Drive.');
  if (!orionGoogleAccessToken) await orionGetGoogleAccessToken(Boolean(options.interactive));

  const api = 'https://www.googleapis.com/drive/v3/files';
  const folderQuery = encodeURIComponent(`name = '${GOOGLE_DRIVE_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  let folders = await orionDriveRequest(`${api}?q=${folderQuery}&spaces=drive&fields=files(id,name)`);
  let folder = folders.files[0];
  if (!folder) {
    folder = await orionDriveRequest('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: GOOGLE_DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' })
    });
  }

  const fileQuery = encodeURIComponent(`name = '${GOOGLE_DRIVE_FILE}' and '${folder.id}' in parents and trashed = false`);
  const files = await orionDriveRequest(`${api}?q=${fileQuery}&spaces=drive&fields=files(id,name)`);
  const body = JSON.stringify(dump, null, 2);
  if (files.files[0]) {
    await orionDriveRequest(`https://www.googleapis.com/upload/drive/v3/files/${files.files[0].id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
    });
  } else {
    const created = await orionDriveRequest('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: GOOGLE_DRIVE_FILE, parents: [folder.id], mimeType: 'application/json' })
    });
    await orionDriveRequest(`https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
    });
  }
  const timestamp = new Date().toISOString();
  try { localStorage.setItem(ORION_LAST_GDRIVE_BACKUP, timestamp); } catch (e) {}
  orionDriveSetStatus(`Google Drive conectado ✓ · último backup: ${new Date(timestamp).toLocaleString('pt-BR')}`);
  return true;
}

async function orionConnectGoogleDrive() {
  if (!orionDriveIsConfigured()) {
    alert('Preencha GOOGLE_CLIENT_ID no shared.js com o Client ID do Google Cloud Console.');
    return;
  }
  const button = document.getElementById('orion-gdrive');
  if (button) button.disabled = true;
  try {
    await orionLoadGoogleScript();
    await orionGetGoogleAccessToken(true);
    orionDriveSetStatus('Google Drive conectado ✓' + orionDriveLastBackupText());
  } catch (error) {
    console.warn('[OrionStudy] não foi possível conectar ao Google Drive:', error);
    alert('Não foi possível conectar ao Google Drive agora.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function orionManualGoogleBackup() {
  if (!orionDriveIsConfigured()) {
    alert('Configure o Client ID do Google Cloud Console antes de usar o Google Drive.');
    return;
  }
  const button = document.getElementById('orion-gdrive-backup');
  if (button) button.disabled = true;
  try {
    await orionLoadGoogleScript();
    if (!orionGoogleAccessToken) await orionGetGoogleAccessToken(true);
    await orionBackupToGoogleDrive();
    if (button) {
      button.textContent = '☁ Salvo no Drive';
      setTimeout(() => { button.textContent = '☁ Salvar no Drive'; }, 1800);
    }
  } catch (error) {
    orionGoogleAccessToken = null;
    console.warn('[OrionStudy] backup manual no Google Drive falhou:', error);
    alert('Não foi possível salvar o backup no Google Drive agora.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function orionRunAutomaticGoogleBackup() {
  if (!orionDriveIsConnected() || !orionDriveIsConfigured()) return;
  try {
    await orionLoadGoogleScript();
    const last = Number.isFinite(Date.parse(localStorage.getItem(ORION_LAST_GDRIVE_BACKUP)))
      ? Date.parse(localStorage.getItem(ORION_LAST_GDRIVE_BACKUP)) : 0;
    if (Date.now() - last < ORION_GDRIVE_INTERVAL) return;
    await orionGetGoogleAccessToken(false);
    await orionBackupToGoogleDrive();
  } catch (error) {
    orionGoogleAccessToken = null;
    console.warn('[OrionStudy] backup automático no Google Drive falhou:', error);
  }
}

function orionImport(file) {
  const reader = new FileReader();
  reader.onload = event => {
    let dump;
    try { dump = JSON.parse(event.target.result); }
    catch (e) { alert('Arquivo inválido: não é um JSON.'); return; }
    if (!dump || dump._app !== 'OrionStudy' || typeof dump.data !== 'object') {
      alert('Este arquivo não parece ser um backup do OrionStudy.'); return;
    }
    const keys = Object.keys(dump.data).filter(key => ORION_KEYS.includes(key));
    if (!keys.length) { alert('O backup não contém dados reconhecidos.'); return; }
    const exportedAt = (dump._exportedAt || '').slice(0, 10) || 'data desconhecida';
    if (!confirm(`Restaurar backup de ${exportedAt}?\n\nIsto SUBSTITUI o progresso atual neste navegador (${keys.length} seção/ões) e recarrega a página.`)) return;
    keys.forEach(key => {
      const value = dump.data[key];
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
    location.reload();
  };
  reader.readAsText(file, 'utf-8');
}

function orionSetButtonFeedback(button) {
  const originalText = button.textContent;
  button.textContent = '✓ Baixado';
  setTimeout(() => { button.textContent = originalText; }, 1600);
}

function orionMountBackupBar() {
  const style = document.createElement('style');
  style.textContent = `
    #orion-backup-bar{position:fixed;left:14px;bottom:14px;z-index:9997;display:flex;gap:6px}
    #orion-backup-bar button,#orion-backup-reminder button{
      font:600 .72rem 'Segoe UI',system-ui,sans-serif;
      background:var(--surface,#13132b);color:var(--muted,#7777aa);
      border:1px solid var(--border,#2a2a55);border-radius:99px;
      padding:5px 12px;cursor:pointer;transition:all .15s;
    }
    #orion-backup-bar button:hover,#orion-backup-reminder button:hover{color:var(--text,#e2e2f0);border-color:var(--muted,#7777aa)}
    #orion-gdrive-status{align-self:center;color:var(--muted,#7777aa);font:500 .68rem 'Segoe UI',system-ui,sans-serif;white-space:nowrap}
    #orion-backup-reminder{position:fixed;right:14px;bottom:14px;z-index:9996;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 28px));padding:10px 12px;background:var(--surface,#13132b);color:var(--text,#e2e2f0);border:1px solid var(--border,#2a2a55);border-radius:8px;box-shadow:0 8px 24px #0003}
    #orion-backup-reminder p{margin:0;font:500 .78rem 'Segoe UI',system-ui,sans-serif;line-height:1.35}
    #orion-backup-reminder-actions{display:flex;gap:6px;flex-shrink:0}
    #orion-backup-reminder .orion-reminder-backup{color:var(--text,#e2e2f0);border-color:var(--muted,#7777aa)}
    #orion-backup-reminder .orion-reminder-dismiss{padding-inline:8px}
    @media(max-width:680px){#orion-backup-bar{left:8px;bottom:8px}#orion-backup-reminder{right:8px;bottom:52px;left:8px;max-width:none;align-items:flex-start;flex-wrap:wrap}#orion-backup-reminder-actions{margin-left:auto}}
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'orion-backup-bar';
  bar.innerHTML = '<button type="button" id="orion-theme" title="Alternar entre tema claro e escuro"></button>' +
    '<button type="button" id="orion-exp" title="Baixar um .json com todo o seu progresso">⬇ Backup</button>' +
    '<button type="button" id="orion-imp" title="Restaurar progresso de um arquivo de backup">⬆ Restaurar</button>' +
    '<button type="button" id="orion-gdrive" title="Conectar e fazer backup no Google Drive">☁ Conectar Google Drive</button>' +
    '<button type="button" id="orion-gdrive-backup" title="Salvar um backup diretamente no Google Drive">☁ Salvar no Drive</button>' +
    '<span id="orion-gdrive-status" aria-live="polite"></span>' +
    '<input type="file" id="orion-imp-file" accept="application/json,.json" hidden>';
  document.body.appendChild(bar);

  const themeButton = document.getElementById('orion-theme');
  const syncThemeButton = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    themeButton.textContent = isLight ? '☾ Escuro' : '☀ Claro';
  };
  syncThemeButton();
  themeButton.onclick = () => {
    const nextTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    try { localStorage.setItem('orion_theme', nextTheme); } catch (e) {}
    syncThemeButton();
  };

  const exportButton = document.getElementById('orion-exp');
  exportButton.onclick = () => {
    if (orionExport()) orionSetButtonFeedback(exportButton);
  };
  document.getElementById('orion-imp').onclick = () => document.getElementById('orion-imp-file').click();
  document.getElementById('orion-imp-file').onchange = event => {
    if (event.target.files[0]) orionImport(event.target.files[0]);
    event.target.value = '';
  };
  const gdriveButton = document.getElementById('orion-gdrive');
  gdriveButton.onclick = orionConnectGoogleDrive;
  document.getElementById('orion-gdrive-backup').onclick = orionManualGoogleBackup;
  if (orionDriveIsConnected()) {
    orionDriveSetStatus('Google Drive conectado ✓' + orionDriveLastBackupText());
  }
}

function orionShouldShowReminder() {
  try {
    const lastBackup = Number.isFinite(Date.parse(localStorage.getItem(ORION_LAST_BACKUP)))
      ? Date.parse(localStorage.getItem(ORION_LAST_BACKUP)) : 0;
    const dismissedAt = Number(localStorage.getItem(ORION_BACKUP_DISMISSED)) || 0;
    return Date.now() - lastBackup > ORION_BACKUP_INTERVAL && Date.now() - dismissedAt > ORION_DISMISS_INTERVAL;
  } catch (e) {
    return true;
  }
}

function orionMountBackupReminder() {
  if (!orionShouldShowReminder()) return;
  const reminder = document.createElement('aside');
  reminder.id = 'orion-backup-reminder';
  reminder.innerHTML = '<p>Já faz mais de 7 dias desde seu último backup. Considere exportar seus dados.</p>' +
    '<div id="orion-backup-reminder-actions"><button type="button" class="orion-reminder-backup">Backup agora</button><button type="button" class="orion-reminder-dismiss">Dispensar</button></div>';
  document.body.appendChild(reminder);
  reminder.querySelector('.orion-reminder-backup').onclick = () => {
    if (orionExport()) reminder.remove();
  };
  reminder.querySelector('.orion-reminder-dismiss').onclick = () => {
    try { localStorage.setItem(ORION_BACKUP_DISMISSED, String(Date.now())); } catch (e) {}
    reminder.remove();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  orionMountBackupBar();
  orionMountBackupReminder();
  orionRunAutomaticGoogleBackup();
  setInterval(orionRunAutomaticGoogleBackup, 30 * 60 * 1000);
});
