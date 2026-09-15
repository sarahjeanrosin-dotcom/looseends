-- The web person who actually edits a page/file needs more than a reason —
-- they need the exact outdated text to find and replace. legacy_copy holds
-- that verbatim quote (only meaningful when relevant = true and the issue is
-- something stated incorrectly rather than an omission).
alter table findings add column if not exists legacy_copy text;
