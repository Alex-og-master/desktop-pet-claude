// Comprobaciones rápidas que no necesitan abrir ventanas: sintaxis de todos
// los .js y que los comandos que Claude puede pedir sean válidos.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = false;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))]) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    console.error(`✗ ${path.relative(ROOT, file)}\n${err.stderr}`);
  }
}

const { TOOLS, toCommand } = require('../src/main/claude');
for (const tool of TOOLS) {
  const props = tool.input_schema.properties;
  const sample = {};
  for (const [k, v] of Object.entries(props)) sample[k] = v.enum ? v.enum[0] : 'hola';
  if (!toCommand(tool.name, sample)) {
    failed = true;
    console.error(`✗ la herramienta ${tool.name} no se traduce a un comando`);
  }
}
if (toCommand('move_to', { target: 'luna' })) {
  failed = true;
  console.error('✗ toCommand acepta valores fuera del enum');
}

for (const asset of ['build/icon.png', 'src/assets/icon.png', 'src/assets/tray.png']) {
  if (!fs.existsSync(path.join(ROOT, asset))) {
    failed = true;
    console.error(`✗ falta ${asset} (ejecuta npm run icons)`);
  }
}

if (failed) process.exit(1);
console.log('✓ todo correcto');
