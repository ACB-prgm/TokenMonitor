import metadata from '../package.json' with {type: 'json'};
/** Package metadata is bundled into both the server and UI from the same source. */
export const installedVersion = metadata.version;
