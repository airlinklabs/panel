export type ActivityCategory =
  | 'server'
  | 'file'
  | 'backup'
  | 'database'
  | 'user'
  | 'node'
  | 'image'
  | 'apikey'
  | 'schedule'
  | 'subuser'
  | 'location'
  | 'allocation'
  | 'other';

export interface ActivityEventMeta {
  label: string;
  category: ActivityCategory;
}

const EVENT_META: Record<string, ActivityEventMeta> = {
  'server:create': { label: 'Server Created', category: 'server' },
  'server:update': { label: 'Server Updated', category: 'server' },
  'server:delete': { label: 'Server Deleted', category: 'server' },
  'server:suspend': { label: 'Server Suspended', category: 'server' },
  'server:unsuspend': { label: 'Server Unsuspended', category: 'server' },
  'server:start': { label: 'Server Started', category: 'server' },
  'server:stop': { label: 'Server Stopped', category: 'server' },
  'server:kill': { label: 'Server Killed', category: 'server' },
  'server:restart': { label: 'Server Restarted', category: 'server' },
  'server:transfer': { label: 'Server Transferred', category: 'server' },
  'server:reinstall': { label: 'Server Reinstalled', category: 'server' },
  'server:update-startup': { label: 'Startup Updated', category: 'server' },
  'file:create': { label: 'File Created', category: 'file' },
  'file:delete': { label: 'File Deleted', category: 'file' },
  'file:rename': { label: 'File Renamed', category: 'file' },
  'file:edit': { label: 'File Edited', category: 'file' },
  'file:upload': { label: 'File Uploaded', category: 'file' },
  'file:download': { label: 'File Downloaded', category: 'file' },
  'file:pull': { label: 'File Pulled', category: 'file' },
  'file:sftp-connect': { label: 'SFTP Connected', category: 'file' },
  'file:sftp-disconnect': { label: 'SFTP Disconnected', category: 'file' },
  'file:sftp-write': { label: 'SFTP Write', category: 'file' },
  'file:sftp-read': { label: 'SFTP Read', category: 'file' },
  'file:sftp-rename': { label: 'SFTP Renamed', category: 'file' },
  'file:sftp-delete': { label: 'SFTP Deleted', category: 'file' },
  'backup:create': { label: 'Backup Created', category: 'backup' },
  'backup:restore': { label: 'Backup Restored', category: 'backup' },
  'backup:download': { label: 'Backup Downloaded', category: 'backup' },
  'backup:delete': { label: 'Backup Deleted', category: 'backup' },
  'backup:lock': { label: 'Backup Locked', category: 'backup' },
  'backup:unlock': { label: 'Backup Unlocked', category: 'backup' },
  'subuser:create': { label: 'Subuser Added', category: 'subuser' },
  'subuser:update': { label: 'Subuser Updated', category: 'subuser' },
  'subuser:delete': { label: 'Subuser Removed', category: 'subuser' },
  'schedule:create': { label: 'Schedule Created', category: 'schedule' },
  'schedule:run': { label: 'Schedule Ran', category: 'schedule' },
  'schedule:delete': { label: 'Schedule Deleted', category: 'schedule' },
  'database:create': { label: 'Database Created', category: 'database' },
  'database:delete': { label: 'Database Deleted', category: 'database' },
  'node:create': { label: 'Node Created', category: 'node' },
  'node:update': { label: 'Node Updated', category: 'node' },
  'node:delete': { label: 'Node Deleted', category: 'node' },
  'node:delete-allocation': { label: 'Allocation Deleted', category: 'allocation' },
  'allocation:create': { label: 'Allocation Created', category: 'allocation' },
  'location:create': { label: 'Location Created', category: 'location' },
  'api:key': { label: 'API Key Used', category: 'apikey' },
  'apikey:create': { label: 'API Key Created', category: 'apikey' },
  'apikey:delete': { label: 'API Key Deleted', category: 'apikey' },
  'user:create': { label: 'User Created', category: 'user' },
  'user:update': { label: 'User Updated', category: 'user' },
  'user:delete': { label: 'User Deleted', category: 'user' },
  'image:create': { label: 'Image Created', category: 'image' },
  'image:update': { label: 'Image Updated', category: 'image' },
  'image:delete': { label: 'Image Deleted', category: 'image' },
};

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  server: 'Servers',
  file: 'Files',
  backup: 'Backups',
  database: 'Databases',
  user: 'Users',
  node: 'Nodes',
  image: 'Images',
  apikey: 'API Keys',
  schedule: 'Schedules',
  subuser: 'Subusers',
  location: 'Locations',
  allocation: 'Allocations',
  other: 'Other',
};

export function getActivityEventMeta(event: string): ActivityEventMeta {
  return EVENT_META[event] ?? { label: event.replace(/[:-]+/g, ' '), category: 'other' };
}

export function getCategoryLabel(category: ActivityCategory): string {
  return CATEGORY_LABELS[category] ?? 'Other';
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ActivityCategory[];
