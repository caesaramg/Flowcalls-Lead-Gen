/**
 * Node 22 tags its built-in SQLite module experimental and prints a warning the
 * first time it is loaded, which is noise on every CLI run. Node 24 does not.
 *
 * Adding a `warning` listener does not replace Node's built-in one, so the
 * default has to be removed first — and this must be imported *before*
 * `node:sqlite`. Every other warning is still printed; only the SQLite
 * experimental notice is dropped.
 */
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && /\bSQLite\b/.test(warning.message)) return;
  console.warn(`${warning.name}: ${warning.message}`);
});
