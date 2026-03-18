#!/usr/bin/env node

import fs from 'node:fs/promises';
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
  superpowers install windsurf [--workspace|--global] [--force]

What it does:
  Installs Superpowers skills for Windsurf.

  By default it installs into the current workspace:
    .windsurf/skills/

  Use --global to install into your user config:
    ~/.codeium/windsurf/skills/
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

function getWindsurfGlobalConfigDir() {
  if (process.env.WINDSURF_CONFIG_DIR) return process.env.WINDSURF_CONFIG_DIR;
  return path.join(os.homedir(), '.codeium', 'windsurf');
}

async function listSkillDirectories(skillsRoot) {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function linkDir({ sourceDir, targetDir }) {
  if (process.platform === 'win32') {
    // Use a junction to avoid needing developer mode/admin.
    // mklink /J <link> <target>
    runOrThrow('cmd', ['/c', 'mklink', '/J', targetDir, sourceDir], { shell: false });
  } else {
    // ln -s <target> <link>
    runOrThrow('ln', ['-s', sourceDir, targetDir], { shell: false });
  }
}

async function installWindsurf({ force, scope }) {
  const packageRoot = path.resolve(__dirname, '..');
  const sourceSkills = path.join(packageRoot, 'skills');

  if (!(await pathExists(sourceSkills))) {
    throw new Error(`Expected skills directory not found: ${sourceSkills}`);
  }

  let targetSkillsDir;
  if (scope === 'global') {
    const configDir = getWindsurfGlobalConfigDir();
    targetSkillsDir = path.join(configDir, 'skills');
  } else {
    // workspace
    targetSkillsDir = path.join(process.cwd(), '.windsurf', 'skills');
  }

  await ensureDir(targetSkillsDir);

  const skillNames = await listSkillDirectories(sourceSkills);
  if (skillNames.length === 0) {
    throw new Error(`No skills found in: ${sourceSkills}`);
  }

  for (const name of skillNames) {
    const sourceDir = path.join(sourceSkills, name);
    const targetDir = path.join(targetSkillsDir, name);

    if (await pathExists(targetDir)) {
      if (!force) {
        process.stderr.write(
          `superpowers: ${targetDir} already exists. Re-run with --force to replace it.\n`
        );
        process.exit(1);
      }
      await removeExistingLinkIfForce(targetDir, force);
    }

    await linkDir({ sourceDir, targetDir });
  }

  process.stdout.write(`Installed Windsurf skills into:\n  ${targetSkillsDir}\n`);
  process.stdout.write('Restart Windsurf (or reload the window) to discover the skills.\n');
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv);
  if (flags.has('--help') || flags.has('-h')) usage(0);

  const force = flags.has('--force');

  const hasGlobal = flags.has('--global');
  const hasWorkspace = flags.has('--workspace');
  if (hasGlobal && hasWorkspace) {
    process.stderr.write('superpowers: --global and --workspace are mutually exclusive\n');
    process.exit(1);
  }
  const scope = hasGlobal ? 'global' : 'workspace';

  // Default behavior: npx superpowers-enhanced@latest
  if (positionals.length === 0) {
    await installWindsurf({ force, scope });
    return;
  }

  const [cmd, platform] = positionals;

  if (cmd === 'install' && platform === 'windsurf') {
    await installWindsurf({ force, scope });
    return;
  }

  usage(1);
}

main().catch((err) => {
  const message = err && typeof err.message === 'string' ? err.message : String(err);
  process.stderr.write(`superpowers: ${message}\n`);
  process.exit(1);
});
