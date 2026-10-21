# Mail runtime state and upgrades

## What it does

Postfix routing maps and OpenDKIM tables are written by the panel every time a domain, mailbox, alias or DKIM key changes. They are **runtime state, not source**: they are not tracked by git, so an installed server's checkout stays clean and `install.sh` can update it (#139), and replacing files with git can no longer leave a container reading stale data (#36).

| Host path (gitignored, `.gitkeep` tracked) | Container path | Written by |
| --- | --- | --- |
| `docker/postfix/config/` (`virtual_domains`, `virtual_mailbox_maps`, `virtual_alias_maps`, compiled `*.lmdb`) | `/etc/postfix/vexlyx/` | `postfix_manager.py` (sources), Postfix entrypoint and `_compile_lmdb_map` (`*.lmdb`) |
| `docker/postfix/opendkim/` (`KeyTable`, `SigningTable`, `TrustedHosts`, `keys/<domain>/`) | `/etc/opendkim/` | `postfix_manager.py` |
| `docker/dovecot/config/` (`users`) | `/etc/dovecot/virtual/` | `dovecot_manager.py` (see [Dovecot](dovecot.md)) |

`docker/postfix/opendkim.conf` is configuration, not state: it stays tracked and is baked into the image at `/etc/opendkim.conf`.

## How it works

- **Directories are mounted, never single files.** A single-file bind mount follows the file's inode; when git (or an editor) replaces the file, the container keeps the old one. A directory mount always sees the current file. The Postfix directory is `/etc/postfix/vexlyx` because Alpine ships `/etc/postfix/virtual` as a file.
- **Nothing is shipped.** A fresh install starts with empty maps and empty OpenDKIM tables; the entrypoint creates them. Development mailboxes are only seeded when `VEXLYX_SEED_DEV_FIXTURES=true`, and then into the ignored files.
- **A map that cannot be built is fatal.** If a source file exists but `postmap` fails or no `.lmdb` results, the Postfix entrypoint prints `ERROR: failed to compile <map>` and exits 1, so the container restarts visibly instead of silently serving a stale or missing map. At runtime `_compile_lmdb_map` raises `PostfixMapError` (see [Postfix](postfix.md)).
- **Health is more than an open port.** The Postfix image has a `HEALTHCHECK` (`docker/postfix/healthcheck.sh`): both compiled maps exist, are readable by the `postfix` user and are not older than their source, and `opendkim` and Postfix are running. `docker ps` shows `unhealthy` when a source changed and was not rebuilt.
- **DKIM keys stay private.** The entrypoint re-applies `0600` to every `*.private` key after its blanket `chmod`, and `reload_opendkim()` does the same before sending SIGUSR1, so OpenDKIM's `RequireSafeKeys` never rejects a key (#138, #141).

## Upgrading a server that tracked this state (v0.3.0 and older)

Re-run the installer (`curl -fsSL https://vexlyx.atlantiqs.org/install.sh | bash`). It uses the **new** `install.sh`, which handles these servers itself; no manual step is needed:

1. If the only local changes are inside `docker/postfix/config/` and `docker/postfix/opendkim/`, it continues. Any other local change keeps the old behaviour ("Local changes detected ... not pulling") and nothing is touched.
2. It copies both directories, including private DKIM keys, to `/etc/vexlyx/mail-backups/pre-upgrade-<UTC time>.XXXXXX/` (mode `0700`, set `VEXLYX_MAIL_BACKUP_DIR` to change the base) and verifies the copy.
3. It stops the API container (the writer) so nothing changes during the swap, returns the tracked files to the committed version, and updates the checkout.
4. It copies the state back, removes only the development entries older releases shipped (a developer's Windows key path and the test domains `vexlyx-test.com`, `wp-blogs.vexlyx.localhost`, `api.wp-blogs.vexlyx.localhost`, `test-postfix-mailer.org`, `test-auth.localhost`; a domain with a private key or a mailbox is kept), and checks that `git status` is clean.
5. If the update or the restore fails, the state is put back exactly as it was and the installer stops with an error. The backup is kept either way.

Real mailboxes, maps, DKIM keys and signing entries are never modified. The installer then rebuilds the mail images and recreates the containers as usual. Re-running it is a no-op once the server is on the new release.

To undo by hand, stop the mail containers and copy the backup directory's `docker/postfix/config` and `docker/postfix/opendkim` back over the checkout's.

## How to test

```bash
python3 -m unittest tests.test_installer_mail_state_migration tests.test_mail_state_untracked -v
docker build -t vexlyx-postfix:credentials-test docker/postfix
python3 -m unittest tests.test_mail_state_mounts -v
```

- `test_installer_mail_state_migration.py`: a dirty v0.3.0 clone (13 mailboxes, three real domains with keys, shipped dev entries) is upgraded through `update_checkout`; checks a clean tree, byte-identical state, `0600` keys, a private backup, dev entries removed, refusal on any other change, restore after a failed update, and idempotence.
- `test_mail_state_untracked.py`: only `.gitkeep` is tracked in the state directories, and a clean checkout stays clean after adding a domain, mailbox, alias and DKIM keys.
- `test_mail_state_mounts.py` (needs Docker): empty state starts healthy, a file replaced on the host is seen by the container, a stale map is `unhealthy`, an unbuildable map stops the container, key modes survive a restart.

CI fails any job that leaves `git status --porcelain` non-empty.

## How to extend

Add new runtime state under one of the ignored directories above and mount its **directory**. Never track a file the panel rewrites. If the migration must preserve a new location on old servers, add it to `MAIL_STATE_DIRS` in `install.sh` and to the migration test.
