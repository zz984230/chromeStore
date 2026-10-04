// scripts/manifest.mjs — 纯装配:壳基座 + 工具增量 → manifest 对象(ADR-0002)
import { SHELL_STRINGS } from '../src/shell/strings.js';

export function assembleManifest(tools, { version }) {
  const permissions = new Set(['storage']); // 壳自身与两工具共用
  const optional = new Set();
  const hosts = new Set();
  const contentScripts = [];
  const war = [];
  const commands = {};
  for (const t of tools) {
    const m = t.manifest ?? {};
    for (const p of m.permissions ?? []) permissions.add(p);
    for (const p of m.optionalPermissions ?? []) optional.add(p);
    for (const h of m.hostPermissions ?? []) hosts.add(h);
    contentScripts.push(...(m.contentScripts ?? []));
    war.push(...(m.webAccessibleResources ?? []));
    Object.assign(commands, m.commands ?? {});
  }
  const toolIcons = { 16: 'icons/toolbar/16.png', 32: 'icons/toolbar/32.png', 48: 'icons/toolbar/48.png', 128: 'icons/toolbar/128.png' };
  return {
    manifest_version: 3,
    name: SHELL_STRINGS.extensionName,
    version,
    description: SHELL_STRINGS.extensionDescription,
    author: 'zhaor121',
    icons: toolIcons,
    background: { service_worker: 'background.js' },
    action: {
      default_title: SHELL_STRINGS.extensionName,
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/toolbar/16.png', 32: 'icons/toolbar/32.png', 48: 'icons/toolbar/48.png', 64: 'icons/toolbar/64.png' },
    },
    options_ui: { open_in_tab: true, page: 'options.html' },
    permissions: [...permissions],
    optional_permissions: [...optional],
    host_permissions: [...hosts],
    content_scripts: contentScripts,
    web_accessible_resources: war,
    commands,
  };
}
