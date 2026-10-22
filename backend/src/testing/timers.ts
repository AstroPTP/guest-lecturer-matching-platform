/**
 * Puts the real timer functions back after a test that used fake ones.
 *
 * On Node 26, jest.useRealTimers() deletes setTimeout and clearTimeout from the
 * test global instead of restoring them, so every later timer call in the file,
 * including the ones inside supertest, throws "clearTimeout is not defined".
 * The originals are captured when this module is first imported, which is
 * before any test installs fake timers, and reinstated after jest has done its
 * part. On a Node where jest restores them correctly this changes nothing.
 */
const realTimers = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setImmediate: globalThis.setImmediate,
  clearImmediate: globalThis.clearImmediate,
};

export function restoreRealTimers(): void {
  jest.useRealTimers();
  Object.assign(globalThis, realTimers);
}
