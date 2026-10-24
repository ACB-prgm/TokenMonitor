import metadata from '../package.json' with {type: 'json'};
/** Package metadata is bundled into both the server and UI from the same source. */
export const installedVersion = process.env.TOKEN_MONITOR_BUILD_VERSION ?? metadata.version;
