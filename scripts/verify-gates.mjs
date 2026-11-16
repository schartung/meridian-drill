import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOUBT_PATTERN =
  /\b(TODO|FIXME|UNSPECIFIED|probably|approx)\b|\/\/\s*wait\b|\/\/\s*approx|\bI think\b/i;

function collectFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function runDoubtTokenGate() {
  const targets = [
    ...collectFiles(path.join(ROOT, 'src')),
    ...collectFiles(path.join(ROOT, 'tests')),
    ...collectFiles(path.join(ROOT, 'docs'))
  ];
  const readmePath = path.join(ROOT, 'README.md');
  if (fs.existsSync(readmePath)) {
    targets.push(readmePath);
  }

  const violations = [];
  for (const file of targets) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(DOUBT_PATTERN);
      if (match) {
        violations.push(
          `${path.relative(ROOT, file)}:${i + 1} matched "${match[0]}"`
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error('FAIL [Doubt-Token Gate]: Prohibited doubt tokens detected:');
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }
  console.log(`PASS [Doubt-Token Gate]: Scanned ${targets.length} files with 0 matches.`);
}

function runCommandGate(label, cmd) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`PASS [${label}]`);
  } catch {
    console.error(`FAIL [${label}]: Command exited nonzero -> ${cmd}`);
    process.exit(1);
  }
}

runDoubtTokenGate();
runCommandGate('TypeScript Strict Gate', 'npx tsc --noEmit');
runCommandGate('Closed-Form Unit Invariant Gate', 'npx tsx --test tests/*.test.ts');
runCommandGate('Vite Production Bundle Gate', 'npx vite build');

const distHtml = path.join(ROOT, 'dist', 'index.html');
if (!fs.existsSync(distHtml) || fs.statSync(distHtml).size === 0) {
  console.error('FAIL [Bundle Artifact Check]: dist/index.html missing or empty.');
  process.exit(1);
}
console.log('PASS [Bundle Artifact Check]: dist/index.html verified.');
