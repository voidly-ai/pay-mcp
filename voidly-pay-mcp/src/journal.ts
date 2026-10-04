/** Private local originals, never credentials. Reservation precedes network dispatch. */
import { constants, openSync, closeSync, fstatSync, fsyncSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import type { CreatorOriginal } from '../../creator-client/src/client';

export class AdapterError extends Error {
  constructor(readonly code: string) { super(code); }
}
const fail = (): never => { throw new AdapterError('PRIVATE_STORAGE_UNAVAILABLE'); };
export function readPrivateJson(path: string, maxBytes = 65536): unknown {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.size > maxBytes) return fail();
    return JSON.parse(readFileSync(fd, 'utf8'));
  } catch { return fail(); } finally { if (fd !== undefined) closeSync(fd); }
}
export function createJournal(directory: string) {
  function checkedDirectory() {
    if (!isAbsolute(directory)) return fail();
    // A trusted host chooses the path; reject symlinked parent components too.
    let current = '/';
    for (const component of directory.split('/').filter(Boolean)) {
      current = join(current, component);
      try { if (lstatSync(current).isSymbolicLink()) return fail(); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    mkdirSync(directory, { mode: 0o700, recursive: true });
    const st = lstatSync(directory);
    if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid?.() || (st.mode & 0o077)) return fail();
  }
  function filename(owner: string, operation: string, key: string) {
    try { checkedDirectory(); } catch { return fail(); }
    const id = createHash('sha256').update(JSON.stringify([owner, operation, key])).digest('hex');
    return join(directory, id + '.json');
  }
  function load(owner: string, operation: string, key: string): CreatorOriginal {
    return readPrivateJson(filename(owner, operation, key)) as CreatorOriginal;
  }
  function reserve(original: CreatorOriginal): boolean {
    const path = filename(original.ownerAccountId, original.operation, original.idempotencyKey);
    let fd: number;
    try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false; return fail(); }
    try { writeFileSync(fd, JSON.stringify(original) + '\n'); fsyncSync(fd); }
    catch { return fail(); } finally { closeSync(fd); }
    // Persist the directory entry before a mutation may leave this process.
    let parent: number | undefined;
    try { parent = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW); fsyncSync(parent); }
    catch { return fail(); } finally { if (parent !== undefined) closeSync(parent); }
    return true;
  }
  return { load, reserve };
}
