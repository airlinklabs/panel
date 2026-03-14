const permissions: string[] = [];

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

export function registerPermission(permission: string): void {
  if (!permissions.includes(permission)) {
    permissions.push(permission);
  }
}

export default permissions;
