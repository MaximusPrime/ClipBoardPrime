'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cbp-e2e-'));

const child = spawn(electron, ['.', '--e2e'], {
  cwd: root,
  env: {
    ...process.env,
    CBP_E2E_USER_DATA: userData,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let stdout = '';
let stderr = '';
const timeout = setTimeout(() => {
  child.kill();
  console.error('Electron E2E testi zaman aşımına uğradı.');
  process.exitCode = 1;
}, 30000);

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

child.on('exit', (code) => {
  clearTimeout(timeout);
  try {
    const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith('CBP_E2E_RESULT:'));
    if (!resultLine) throw new Error(`E2E sonucu alınamadı.\n${stdout}\n${stderr}`);
    const result = JSON.parse(resultLine.slice('CBP_E2E_RESULT:'.length));

    if (!result.onboarding.active) throw new Error('İlk kurulum modalı açılmadı.');
    if (result.onboarding.clientHeight > result.onboarding.viewportHeight) {
      throw new Error('Kurulum modalı pencere yüksekliğini aşıyor.');
    }
    if (result.liveTheme !== 'light') throw new Error('Tema canlı önizlemesi uygulanmadı.');
    if (!result.modalBlurProtected) {
      throw new Error('Modal açıkken blur-to-tray pencereyi gizledi.');
    }
    if (!result.compact.rendererMode || !result.compact.resizable) {
      throw new Error('Kompakt pano modu renderer/pencere durumuna uygulanmadı.');
    }
    if (!result.snapEligible) {
      throw new Error('Pencere Windows Snap için taşınabilir, boyutlandırılabilir ve maksimize edilebilir değil.');
    }
    if (!result.notes.rendererMode || !result.notes.resizable) {
      throw new Error('Notlar görünümü doğru uygulanmadı.');
    }
    if (!result.workspaceSwitchKeepsBounds) {
      throw new Error('Pano/Notlar geçişi pencere boyutunu veya konumunu değiştirdi.');
    }
    if (!result.boundsPersisted) {
      throw new Error('Pencere boyutu veya konumu kalıcı ayara kaydedilmedi.');
    }
    if (!result.cursorPositionKeepsRememberedBounds) {
      throw new Error('İmleç yanında açılış kalıcı son pencere konumunu ezdi.');
    }
    if (!result.maximizedStatePersisted) {
      throw new Error('Pencerenin maksimize durumu kalıcı ayara kaydedilmedi.');
    }
    if (!result.boundsRecovered) throw new Error('Ekran dışı pencere bounds değeri toparlanmadı.');
    if (!result.reloadState.appReady || !result.reloadState.mainVisible || !result.reloadState.onboardingPresent) {
      throw new Error('Renderer reload sonrasında uygulama durumu yeniden kurulamadı.');
    }
    if (code !== 0) throw new Error(`Electron ${code} koduyla kapandı.\n${stderr}`);

    console.log('Electron E2E: onboarding, canlı tema ve pencere profilleri doğrulandı.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
