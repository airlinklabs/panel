type CorePermission =
  | 'server.*'
  | 'server.view'
  | 'server.start'
  | 'server.stop'
  | 'server.restart'
  | 'server.files'
  | 'server.settings'
  | 'admin.*'
  | 'airlink.admin.addons.view'
  | 'airlink.admin.addons.toggle'
  | 'airlink.admin.addons.reload'
  | 'airlink.admin.addons.store'
  | 'airlink.admin.addons.install'
  | 'airlink.admin.addons.settings'
  | 'airlink.admin.addons.commands'
  | 'airlink.admin.analytics.view'
  | 'airlink.admin.users.view'
  | 'airlink.admin.users.create'
  | 'airlink.admin.users.edit'
  | 'airlink.admin.users.delete'
  | 'airlink.admin.nodes.view'
  | 'airlink.admin.nodes.create'
  | 'airlink.admin.nodes.update'
  | 'airlink.admin.nodes.delete'
  | 'airlink.admin.servers.view'
  | 'airlink.admin.servers.create'
  | 'airlink.admin.servers.update'
  | 'airlink.admin.servers.delete'
  | 'airlink.admin.apikeys.view'
  | 'airlink.admin.apikeys.create'
  | 'airlink.admin.apikeys.delete'
  | 'airlink.admin.apikeys.edit'
  | 'airlink.admin.api.docs.view'
  | 'airlink.admin.menu.main'
  | 'airlink.admin.overview.main'
  | 'airlink.admin.overview.checkForUpdates'
  | 'airlink.admin.overview.performUpdate'
  | 'airlink.admin.playerstats.view'
  | 'airlink.admin.databases.view'
  | 'airlink.admin.databases.create'
  | 'airlink.admin.databases.delete'
  | 'airlink.admin.databases.test'
  | 'airlink.api.keys.view'
  | 'airlink.api.keys.create'
  | 'airlink.api.keys.delete'
  | 'airlink.api.keys.edit'
  | 'airlink.api.servers.read'
  | 'airlink.api.servers.create'
  | 'airlink.api.servers.update'
  | 'airlink.api.servers.delete'
  | 'airlink.api.users.read'
  | 'airlink.api.users.create'
  | 'airlink.api.users.update'
  | 'airlink.api.users.delete'
  | 'airlink.api.nodes.read'
  | 'airlink.api.nodes.create'
  | 'airlink.api.nodes.update'
  | 'airlink.api.nodes.delete'
  | 'airlink.api.settings.read'
  | 'airlink.api.settings.update'
  | 'airlink.api.images.read'
  | 'airlink.api.images.create'
  | 'airlink.api.images.update'
  | 'airlink.api.images.delete'
  | 'airlink.api.locations.read'
  | 'airlink.api.locations.create';

export type Permission = CorePermission | `addon.${string}`;

const permissions: Permission[] = [];
const addonPermissionRegistry = new Map<string, string[]>();

export function registerPermission(permission: Permission): void {
  if (!permissions.includes(permission)) {
    permissions.push(permission);
  }
}

export function registerAddonPermission(
  addonSlug: string,
  permission: string,
): boolean {
  const expectedNs = `addon.${addonSlug}.`;
  if (!permission.startsWith(expectedNs)) {
    logger.warn(
      `Addon "${addonSlug}" tried to register permission outside its namespace: "${permission}"`,
    );
    return false;
  }

  const typed = permission as Permission;
  if (!permissions.includes(typed)) {
    permissions.push(typed);
  }

  const existing = addonPermissionRegistry.get(addonSlug) ?? [];
  if (!existing.includes(permission)) {
    existing.push(permission);
    addonPermissionRegistry.set(addonSlug, existing);
  }

  return true;
}

export function clearAddonPermissions(addonSlug: string): void {
  const perms = addonPermissionRegistry.get(addonSlug);
  if (!perms) {
    return;
  }

  for (const perm of perms) {
    const idx = permissions.indexOf(perm as Permission);
    if (idx !== -1) {
      permissions.splice(idx, 1);
    }
  }

  addonPermissionRegistry.delete(addonSlug);
}

export function hasPermission(
  userPerms: Permission[],
  required: Permission,
): boolean {
  return userPerms.some((perm) => {
    if (perm === required) {
      return true;
    }
    if (perm.endsWith('.*')) {
      const base = perm.slice(0, -2);
      return required.startsWith(`${base}.`);
    }
    return false;
  });
}

import logger from './logger';

registerPermission('airlink.api.keys.view');
registerPermission('airlink.api.keys.create');
registerPermission('airlink.api.keys.delete');
registerPermission('airlink.api.keys.edit');

registerPermission('airlink.api.servers.read');
registerPermission('airlink.api.servers.create');
registerPermission('airlink.api.servers.update');
registerPermission('airlink.api.servers.delete');
registerPermission('airlink.api.users.read');
registerPermission('airlink.api.users.create');
registerPermission('airlink.api.users.update');
registerPermission('airlink.api.users.delete');
registerPermission('airlink.api.nodes.read');
registerPermission('airlink.api.nodes.create');
registerPermission('airlink.api.nodes.update');
registerPermission('airlink.api.nodes.delete');
registerPermission('airlink.api.settings.read');
registerPermission('airlink.api.settings.update');
registerPermission('airlink.admin.addons.settings');
registerPermission('airlink.admin.addons.commands');
registerPermission('airlink.api.images.read');
registerPermission('airlink.api.images.create');
registerPermission('airlink.api.images.update');
registerPermission('airlink.api.images.delete');
registerPermission('airlink.api.locations.read');
registerPermission('airlink.api.locations.create');
registerPermission('airlink.admin.menu.main');

export default permissions;
