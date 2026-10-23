// Genera build/icon.png (icono de la app) y src/assets/{icon,tray}.png a
// partir del mismo sprite que usa la mascota. Se ejecuta con Electron:
//   npm run icons
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');

const PAGE = `<!doctype html><html><body>
<script src="file://${path.join(ROOT, 'src/renderer/pet/sprite.js')}"></script>
<script>
  function render(size, pose, pad, bg) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (bg) {
      const r = size * 0.22;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, r);
      ctx.fill();
    }
    const img = Sprites.drawPet(pose);
    // recorta al contenido del sprite (x de -9 a 8, y de -13 a -1)
    const { OX, OY } = Sprites.GRID;
    const sx = OX - 9, sy = OY - 13, sw = 18, sh = 13;
    const scale = Math.floor((size - pad * 2) / sw);
    const w = sw * scale, h = sh * scale;
    ctx.drawImage(img, sx, sy, sw, sh, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    return c.toDataURL('image/png');
  }
</script></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const tmp = path.join(app.getPath('temp'), 'clawdy-icons.html');
  fs.writeFileSync(tmp, PAGE);
  await win.loadFile(tmp);
  const save = async (file, expr) => {
    const url = await win.webContents.executeJavaScript(expr);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('escrito', path.relative(ROOT, file));
  };
  await save(path.join(ROOT, 'build/icon.png'), `render(1024, { arms: 'up', eyes: 'happy', blush: true }, 150, '#F4E9DC')`);
  await save(path.join(ROOT, 'src/assets/icon.png'), `render(256, { arms: 'up', eyes: 'happy', blush: true }, 36, '#F4E9DC')`);
  await save(path.join(ROOT, 'src/assets/tray.png'), `render(32, {}, 0, null)`);
  await save(path.join(ROOT, 'src/assets/tray@2x.png'), `render(64, {}, 0, null)`);
  fs.unlinkSync(tmp);
  app.quit();
});
