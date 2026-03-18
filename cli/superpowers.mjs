#!/usr/bin/env node

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage(exitCode = 0) {
  const msg = `superpowers

Usage:
  superpowers-enhanced
  superpowers install windsurf [--force]

What it does:
  Installs Superpowers skills for Windsurf by linking this package's ./skills
  directory into ~/.agents/skills/superpowers (cross-agent skill discovery).
`;
  process.stdout.write(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positionals = args.filter((a) => !a.startsWith('--'));
  return { flags, positionals };
}

async function pathExists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function runOrThrow(command, args, opts = {}) {
  const res = spawnSync(command, args, { stdio: 'inherit', ...opts });
  if (res.error) throw res.error;
  if (typeof res.status === 'number' && res.status !== 0) {
    const err = new Error(`Command failed: ${command} ${args.join(' ')}`);
    err.code = res.status;
    throw err;
  }
}

async function removeExistingLinkIfForce(linkPath, force) {
  if (!force) return;

  if (!(await pathExists(linkPath))) return;

  // Windows junctions and symlinks may appear as directories; rm recursive handles both.
  await fs.rm(linkPath, { recursive: true, force: true });
}

async function installWindsurf({ force }) {
  const packageRoot = path.resolve(__dirname, '..');
  const sourceSkills = path.join(packageRoot, 'skills');

  if (!(await pathExists(sourceSkills))) {
    throw new Error(`Expected skills directory not found: ${sourceSkills}`);
  }

  const home = os.homedir();
  const agentsSkillsDir = path.join(home, '.agents', 'skills');
  const linkPath = path.join(agentsSkillsDir, 'superpowers');

  await ensureDir(agentsSkillsDir);

  if (await pathExists(linkPath)) {
    if (!force) {
      process.stderr.write(
        `superpowers: ${linkPath} already exists. Re-run with --force to replace it.\n`
      );
      process.exit(1);
    }
    await removeExistingLinkIfForce(linkPath, force);
  }

  if (process.platform === 'win32') {
    // Use a junction to avoid needing developer mode/admin.
    // mklink /J <link> <target>
    runOrThrow('cmd', ['/c', 'mklink', '/J', linkPath, sourceSkills], { shell: false });
  } else {
    // ln -s <target> <link>
    runOrThrow('ln', ['-s', sourceSkills, linkPath], { shell: false });
  }

  process.stdout.write(`Installed Windsurf skills link:\n  ${linkPath} -> ${sourceSkills}\n`);
  process.stdout.write('Restart Windsurf (or reload the window) to discover the skills.\n');
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv);
  if (flags.has('--help') || flags.has('-h')) usage(0);

  const force = flags.has('--force');

  // Default behavior: npx superpowers-enhanced@latest
  if (positionals.length === 0) {
    await installWindsurf({ force });
    return;
  }

  const [cmd, platform] = positionals;

  if (cmd === 'install' && platform === 'windsurf') {
    await installWindsurf({ force });
    return;
  }

  usage(1);
}

main().catch((err) => {
  const message = err && typeof err.message === 'string' ? err.message : String(err);
  process.stderr.write(`superpowers: ${message}\n`);
  process.exit(1);
});
