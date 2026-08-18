/**
 * How long an archived trip stays restorable. The undo toast is far shorter;
 * this is the window before the row is hard-deleted for good.
 */
export const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;
