import { join, resolve, sep } from 'path';

const BACKUP_NAME_PATTERN = /^postgres-backup-[A-Za-z0-9._-]+$/;

export function getBackupRoot() {
  return resolve(process.env.BACKUP_DIR || join(process.cwd(), 'backups'));
}

export function resolveBackupDirectory(backupName: string) {
  if (!BACKUP_NAME_PATTERN.test(backupName)) {
    return null;
  }

  const root = getBackupRoot();
  const backupPath = resolve(root, backupName);
  const rootWithSeparator = root.endsWith(sep) ? root : `${root}${sep}`;

  if (!backupPath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
    return null;
  }

  return backupPath;
}
