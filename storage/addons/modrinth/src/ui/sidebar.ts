export function createSidebarIcon(): string {
  return `<svg class="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>`;
}

export function registerSidebarItems(ui: any): void {
  ui.addSidebarItem?.({
    id: 'modrinth-store',
    label: 'Modrinth Store',
    icon: createSidebarIcon(),
    url: '/modrinth',
    section: 'main',
    order: 50,
    description: 'Browse and install mods, modpacks, and plugins',
  });

  ui.addSidebarItem?.({
    id: 'modrinth-admin-config',
    label: 'Modrinth Admin',
    icon: createSidebarIcon(),
    url: '/modrinth/admin/config',
    isAdminItem: true,
    order: 1,
    description: 'Configure Modrinth addon settings',
  });
}

export function unregisterSidebarItems(ui: any): void {
  ui.removeSidebarItem?.('modrinth-store');
  ui.removeSidebarItem?.('modrinth-admin-config');
}
