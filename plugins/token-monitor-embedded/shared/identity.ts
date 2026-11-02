/** Build-time identities let the local DEV plugin coexist with the release. */
export const isDev = process.env.TOKEN_MONITOR_DEV === '1';
export const pluginName = isDev ? 'token-monitor-dev' : 'token-monitor-embedded';
export const displayName = isDev ? 'Token Monitor DEV' : 'Token Monitor';
export const serverDisplayName = displayName;
