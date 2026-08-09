/**
 * Explicit feature registry.
 *
 * Replaces the recursive dynamic `import()` discovery in modulesLoader.ts.
 * Every panel module is imported statically here, in deterministic mount
 * order (the order in which routers are attached to the app). Registration
 * validates the module shape at import time, so an invalid or incompatible
 * registration fails loudly at startup instead of being silently skipped.
 */

import type { Module } from '../handlers/moduleInit';

import admin_activity from './admin/activity';
import admin_addons from './admin/addons';
import admin_analytics from './admin/analytics';
import admin_apiKeys from './admin/apiKeys';
import admin_databases from './admin/databases';
import admin_images from './admin/images';
import admin_locations from './admin/locations';
import admin_menu from './admin/menu';
import admin_mounts from './admin/mounts';
import admin_nodes from './admin/nodes';
import admin_overview from './admin/overview';
import admin_playerStats from './admin/playerStats';
import admin_radar from './admin/radar';
import admin_security from './admin/security';
import admin_servers from './admin/servers';
import admin_settings from './admin/settings';
import admin_uiComponents from './admin/uiComponents';
import admin_users from './admin/users';
import api_Alternative_api from './api/Alternative/api';
import api_client_clientApi from './api/client/clientApi';
import api_v1_api from './api/v1/api';
import auth_auth from './auth/auth';
import auth_authService from './auth/authService';
import auth_passwordReset from './auth/passwordReset';
import core from './core';
import realtime from './realtime';
import user_account from './user/account';
import user_createServer from './user/createServer';
import user_dashboard from './user/dashboard';
import user_folderSystem from './user/folderSystem';
import user_images from './user/images';
import user_onboarding from './user/onboarding';
import user_server from './user/server';
import user_serverConsole from './user/serverConsole';
import user_sftp from './user/sftp';
import user_twoFactor from './user/twoFactor';
import user_wsUsers from './user/wsUsers';

export interface RegisteredModule {
  module: Module;
  /** Logical feature name used in logs. */
  name: string;
}

function assertModuleShape(
  candidate: unknown,
  name: string,
): asserts candidate is Module {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error(`[feature-registry] '${name}' is not a module object`);
  }
  const mod = candidate as Partial<Module>;
  if (typeof mod.info !== 'object' || mod.info === null) {
    throw new Error(`[feature-registry] '${name}' is missing module info`);
  }
  if (typeof mod.info?.name !== 'string' || typeof mod.info?.version !== 'string') {
    throw new Error(`[feature-registry] '${name}' info is missing name or version`);
  }
  if (typeof mod.router !== 'function') {
    throw new Error(`[feature-registry] '${name}' does not export a router factory`);
  }
}

/**
 * Static, ordered list of every mounted feature. Keep this list in the exact
 * order modules used to load under recursive discovery (admin, then api,
 * auth, core, realtime, user) so route precedence is unchanged.
 */
const candidates: { module: unknown; name: string }[] = [
  { module: admin_activity, name: 'admin/activity' },
  { module: admin_addons, name: 'admin/addons' },
  { module: admin_analytics, name: 'admin/analytics' },
  { module: admin_apiKeys, name: 'admin/apiKeys' },
  { module: admin_databases, name: 'admin/databases' },
  { module: admin_images, name: 'admin/images' },
  { module: admin_locations, name: 'admin/locations' },
  { module: admin_menu, name: 'admin/menu' },
  { module: admin_mounts, name: 'admin/mounts' },
  { module: admin_nodes, name: 'admin/nodes' },
  { module: admin_overview, name: 'admin/overview' },
  { module: admin_playerStats, name: 'admin/playerStats' },
  { module: admin_radar, name: 'admin/radar' },
  { module: admin_security, name: 'admin/security' },
  { module: admin_servers, name: 'admin/servers' },
  { module: admin_settings, name: 'admin/settings' },
  { module: admin_uiComponents, name: 'admin/uiComponents' },
  { module: admin_users, name: 'admin/users' },
  { module: api_Alternative_api, name: 'api/alternative' },
  { module: api_client_clientApi, name: 'api/client' },
  { module: api_v1_api, name: 'api/v1' },
  { module: auth_auth, name: 'auth' },
  { module: auth_authService, name: 'auth/service' },
  { module: auth_passwordReset, name: 'auth/passwordReset' },
  { module: core, name: 'core' },
  { module: realtime, name: 'realtime' },
  { module: user_account, name: 'user/account' },
  { module: user_createServer, name: 'user/createServer' },
  { module: user_dashboard, name: 'user/dashboard' },
  { module: user_folderSystem, name: 'user/folderSystem' },
  { module: user_images, name: 'user/images' },
  { module: user_onboarding, name: 'user/onboarding' },
  { module: user_server, name: 'user/server' },
  { module: user_serverConsole, name: 'user/serverConsole' },
  { module: user_sftp, name: 'user/sftp' },
  { module: user_twoFactor, name: 'user/twoFactor' },
  { module: user_wsUsers, name: 'user/wsUsers' },
];

export const FEATURE_REGISTRY: RegisteredModule[] = candidates.map(
  ({ module, name }) => {
    assertModuleShape(module, name);
    return { module, name };
  },
);

/** All registered modules, in mount order. */
export const registeredModules = (): readonly RegisteredModule[] =>
  FEATURE_REGISTRY;
