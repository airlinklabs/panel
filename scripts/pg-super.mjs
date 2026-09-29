/**
 * pg-super.mjs — PostgreSQL superuser execution helper.
 *
 * Tries methods in order:
 *   1. sudo -n -u postgres psql  (NOPASSWD configured)
 *   2. SUDO_PASSWORD env var     (CI pipelines)
 *   3. Interactive password box  (interactive terminals)
 *
 * All database scripts import { runAsSuper, runAsSuperDb,
 * runShellAsSuper, dropRoleCleanly, detectMethod } from here.
 * The sudo password is cached in memory after first successful use.
 */

import { execSync } from 'node:child_process';
import { sudo } from './ui.mjs';

// ── State ────────────────────────────────────────────────────────────────────

let _password = process.env.SUDO_PASSWORD ?? null;
let _method   = null; // "nopasswd" | "sudo" | null

// ── Detect access method ──────────────────────────────────────────────────────

function _testNopasswd() {
  try {
    execSync('sudo -n -u postgres psql -c \'SELECT 1\'', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function _verifySudoPassword(pw) {
  try {
    execSync(`echo "${pw}" | sudo -S -u postgres psql -c 'SELECT 1'`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect and cache which sudo method is available.
 * Throws if no usable method can be found.
 *
 * @returns {Promise<"nopasswd"|"sudo">}
 */
export async function detectMethod() {
  if (_method) {return _method;}

  // Already have a password from the env or a previous call
  if (_password) {
    if (_verifySudoPassword(_password)) {
      _method = 'sudo';
      return _method;
    }
    throw new Error(
      'SUDO_PASSWORD env var is set but sudo verification failed.',
    );
  }

  // Try passwordless sudo first
  if (_testNopasswd()) {
    _method = 'nopasswd';
    return _method;
  }

  // Need to ask the user interactively
  if (!process.stdout.isTTY) {
    throw new Error(
      'Cannot access postgres superuser non-interactively.\n' +
        'Configure NOPASSWD sudo or set the SUDO_PASSWORD environment variable.',
    );
  }

  let attempts = 0;
  while (attempts < 3) {
    const pw = await sudo(
      'Running PostgreSQL commands requires superuser (postgres) access.',
    );

    if (!pw) {
      throw new Error('No sudo password provided.');
    }

    if (_verifySudoPassword(pw)) {
      _password = pw;
      _method   = 'sudo';
      return _method;
    }

    attempts++;
    if (attempts < 3) {
      process.stdout.write(
        `  ! Incorrect password, try again (${attempts}/3)\n`,
      );
    }
  }

  throw new Error(
    'Sudo password verification failed after 3 attempts.\n' +
      'Configure NOPASSWD sudo:\n' +
      '  sudo visudo -f /etc/sudoers.d/postgres\n' +
      '  <username> ALL=(postgres) NOPASSWD: /usr/bin/psql, /usr/bin/pg_dump',
  );
}

// ── SQL execution helpers ─────────────────────────────────────────────────────

function _buildCmd(sql, dbName) {
  const dbFlag = dbName ? `-d "${dbName}" ` : '';
  if (_method === 'nopasswd') {
    return `sudo -n -u postgres psql ${dbFlag}-c "${sql}"`;
  }
  return `echo "${_password}" | sudo -S -u postgres psql ${dbFlag}-c "${sql}"`;
}

/**
 * Execute SQL as the postgres superuser on the default database.
 *
 * @param {string} sql
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
export async function runAsSuper(sql) {
  await detectMethod();
  try {
    const output = execSync(_buildCmd(sql), {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, output: e.stderr || e.message };
  }
}

/**
 * Execute SQL as the postgres superuser on a specific database.
 *
 * @param {string} sql
 * @param {string} dbName
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
export async function runAsSuperDb(sql, dbName) {
  await detectMethod();
  try {
    const output = execSync(_buildCmd(sql, dbName), {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, output: e.stderr || e.message };
  }
}

/**
 * Execute a shell command as the postgres system user.
 *
 * @param {string} cmd
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
export async function runShellAsSuper(cmd) {
  await detectMethod();
  const full =
    _method === 'nopasswd'
      ? `sudo -n -u postgres ${cmd}`
      : `echo "${_password}" | sudo -S -u postgres ${cmd}`;

  try {
    const output = execSync(full, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, output: e.stderr || e.message };
  }
}

// ── Drop a role cleanly ───────────────────────────────────────────────────────

/**
 * Revoke all privileges a role holds across every database, then drop it.
 * Safe to call even when the role has no objects.
 *
 * @param {string} roleName
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
export async function dropRoleCleanly(roleName) {
  const dbs = await runAsSuper(
    'SELECT datname FROM pg_database WHERE datname NOT IN (\'template0\')',
  );
  if (!dbs.ok) {return dbs;}

  const dbNames = dbs.output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('datname') && !l.startsWith('---') && !l.startsWith('('));

  for (const db of dbNames) {
    await runAsSuperDb(`REASSIGN OWNED BY ${roleName} TO postgres`,                                db);
    await runAsSuperDb(`DROP OWNED BY ${roleName} CASCADE`,                                        db);
    await runAsSuperDb(`REVOKE ALL ON SCHEMA public FROM ${roleName}`,                             db);
    await runAsSuperDb(`REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM ${roleName}`, db);
    await runAsSuperDb(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${roleName}`, db);
    await runAsSuperDb(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${roleName}`, db);
    await runAsSuperDb(`REVOKE ALL PRIVILEGES ON DATABASE ${db} FROM ${roleName}`,                 db);
  }

  return runAsSuper(`DROP ROLE IF EXISTS ${roleName}`);
}
