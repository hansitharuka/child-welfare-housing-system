-- A file can be the scan of an allocation letter (REL-2). The new value has a migration of its own,
-- because PostgreSQL can't use an enum value in the transaction that adds it.
ALTER TYPE "FileKind" ADD VALUE 'LETTER';
