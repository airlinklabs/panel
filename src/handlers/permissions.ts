const permissions: Permission[] = [];

export type Permission =
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
  | 'airlink.admin.analytics.view'
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
  | 'airlink.api.settings.update';

export function registerPermission(permission: Permission): void {
  if (!permissions.includes(permission)) {
    permissions.push(permission);
  }
}

export function hasPermission(userPerms: Permission[], required: Permission): boolean {
  return userPerms.some((perm) => {
    if (perm === required) return true;
    if (perm.endsWith('.*')) {
      const base = perm.slice(0, -2);
      return required.startsWith(`${base}.`);
    }
    return false;
  });
}

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
registerPermission('airlink.admin.menu.main');

export default permissions;
