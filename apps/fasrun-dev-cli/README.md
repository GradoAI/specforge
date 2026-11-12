# FASRUN-DEV-CLI

## Archive a delivered specification change

```sh
fasrun spec validate fasrun/
fasrun spec archive fasrun/changes/<work-id>-<description> --date YYYY-MM-DD
fasrun check
```

`--date` is optional and defaults to the current UTC date. `--json` uses the normal
CLI result/error envelope. Archive accepts an active change directory immediately
under the specification root's `changes/` directory.

The archive planner validates the whole specification tree before merging ADDED,
MODIFIED, REMOVED and RENAMED entries in memory, and validates the proposed tree
again. Current capability files must exist. Duplicate additions, missing targets,
rename title mismatches and an existing archive destination fail without writes.
RENAMED keeps the requirement ID and scenarios. This writer supports the D-12 skeleton with one `## Requirements` section. Extra
auxiliary headings are explicitly rejected before writing because this implementation
cannot preserve them during rewriting. Such files may still pass `spec validate`;
validation success does not imply this writer supports every document structure.
Header text in supported current specs and
all change-directory artifacts are retained.

The CLI stages file contents, backs up and replaces affected current spec files,
then moves the complete change directory to
`changes/archive/<UTC-date>-<original-directory-name>/`. A reported write or rename
failure restores previous files and removes temporary artifacts. Symlinks in the
specification tree are rejected. This rollback protects failures during execution;
it is not a crash-recovery journal or a concurrent-edit protocol. Run archive with
exclusive access to the specification directory.

SF-1 itself is archived only by its later T020 completion task. T016 supplies and
tests this command against isolated fixtures; it does not archive unfinished work.
