import adminServers from './admin/servers';
import adminNodes from './admin/nodes';
import adminUsers from './admin/users';
import adminApiKeys from './admin/apiKeys';
import adminImages from './admin/images';
import adminLocations from './admin/locations';
import adminMounts from './admin/mounts';
import adminDatabases from './admin/databases';
import adminSettings from './admin/settings';
import adminSecurity from './admin/security';
import adminRadar from './admin/radar';
import adminAddons from './admin/addons';
import adminOverview from './admin/overview';
import adminAnalytics from './admin/analytics';
import adminPlayerStats from './admin/playerStats';
import adminActivity from './admin/activity';
import adminMenu from './admin/menu';
import adminQueue from './admin/queue';

import authPages from './auth/index';

import userPages from './user/index';
import userCreateServer from './user/createServer';
import userServerPages from './user/server/index';
import userServerFiles from './user/server/files';
import userServerLogs from './user/server/logs';

export const pageModules = [
  adminServers,
  adminNodes,
  adminUsers,
  adminApiKeys,
  adminImages,
  adminLocations,
  adminMounts,
  adminDatabases,
  adminSettings,
  adminSecurity,
  adminRadar,
  adminAddons,
  adminOverview,
  adminAnalytics,
  adminPlayerStats,
  adminActivity,
  adminMenu,
  adminQueue,

  authPages,

  userPages,
  userCreateServer,
  userServerPages,
  userServerFiles,
  userServerLogs,
];

export default pageModules;
