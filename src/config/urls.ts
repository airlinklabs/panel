/**
 * External URLs — egg repos, GitHub API, VirusTotal, etc.
 */

export const EGG_REPO_URL = 'https://github.com/pterodactyl/game-eggs.git';
export const EGG_REPO_BRANCH = 'master';
export const EGG_REPO_PATH = 'eggs';
export const PANEL_UPDATE_API_BASE =
  'https://api.github.com/repos/airlinklabs/panel';
export const VT_API_BASE = 'https://www.virustotal.com/api/v3';
export const VT_GUI_BASE = 'https://www.virustotal.com/gui';
export const VT_GUI_FILE_URL = (hash: string) => `${VT_GUI_BASE}/file/${hash}`;
export const VT_GUI_UPLOAD_URL = `${VT_GUI_BASE}/home/upload`;

export const GITHUB_AVATAR_URL = (login: string) =>
  `https://github.com/${login}.png`;
export const GITHUB_AVATAR_FALLBACK = 'https://github.com/ghost.png';
export const GITHUB_CONTRIBUTORS_URL =
  'https://api.github.com/repos/airlinklabs/panel/contributors?per_page=100';
export const GITHUB_REPO_URL = 'https://github.com/airlinklabs/panel';
export const GITHUB_ORG_URL = 'https://github.com/airlinklabs';
export const GITHUB_LICENSE_URL =
  'https://github.com/airlinklabs/panel/blob/main/LICENSE';

export const DISCORD_INVITE_URL = 'https://discord.gg/BybfXms7JZ';
export const COMPANY_WEBSITE_URL = 'https://airlinklabs.xyz/';
export const DOCS_QUICKSTART_URL = 'https://airlinklabs.xyz/docs/quickstart/';
export const DONATION_URL = 'https://ko-fi.com/airlinklabs#checkoutModal';

export const CRAFATAR_AVATAR_BASE = 'https://crafatar.com/avatars/';
export const VT_GUI_INFO_URL = 'https://www.virustotal.com';
