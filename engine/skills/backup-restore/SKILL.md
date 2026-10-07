---
name: backup-restore
description: Back up and restore a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - set up a backup store (local folder, S3, FTP/FTPS, SFTP), take a backup and follow it to completion, list backups, restore all or part of one, verify the site afterwards. Use when asked to back up, snapshot, restore, roll back or undo changes on a PanelAlpha Engine project, to set up backup storage, or before risky work on a project that holds data.
---

# Back up and restore on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every project tool takes the project as `name`; store tools take the store's `id`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. A backup store

`backup_container_list` - every store: `id`, `name`, `driver`, `location`, `has_credentials` (secrets are never returned). Empty → no project can be backed up yet.

`backup_container_create` - `name` (unique), `driver`, `location`, `credentials`:

| `driver` | `location` | `credentials` |
|---|---|---|
| `local` | a folder on the engine server - not `/`, `/home`, or a path with `..` | none |
| `s3` | the bucket | `access_key_id`, `secret_access_key`; optional `region` (default `us-east-1`), `endpoint` + `use_path_style_endpoint` for S3-compatible storage, `prefix` |
| `ftp`, `ftps` | the remote folder | `host`, `username`; optional `password`, `port` (21) |
| `sftp` | the remote folder | `host`, `username`; `password` or `private_key` (+ `passphrase`); optional `port` (22) |

**`credentials` take no vault refs** - a `vault:<id>` would be stored as the secret itself. Never ask for a remote store's secret in chat: have the operator create that store on the engine host with `pae backup:container:create` (`--help` lists each driver's options), then continue here. A `local` store needs no secret; create it here, and say once that it sits on the same server - it undoes a mistake, it does not survive losing the server.

`backup_container_test` - `id`: `ok: true`, or `422` with the storage's own message. Test every new or changed store before relying on it.

`backup_container_update` - `id` plus the fields to change. `credentials` replaces the whole set - every field again, so a secret change is again the operator's, on the host. A new `driver` or `location` on a store that holds backups points it away from them: they can no longer be restored.

`backup_container_delete` - `id`. `409` while the store still holds backups: `backup_delete` them first (step 6).

## 2. Take a backup

`backup_create` - `name`, `container` (a store's `id` or `name`) → `202`, the backup `id` and `async_status.backup: pending`. It runs in the background.

- In it: everything under `/project`, every named volume of the app's containers, every MySQL database of the project (`mysql_database_list`)
- Not in it: the project's settings (stored `env_vars`, domains, limits) and its MySQL users
- **The app is stopped while those are archived** and started again before the upload: tell the user to expect a short outage

Follow it: `backup_get` - `name`, `id` - every 20-30 s until `async_status.backup` is `completed` or `failed` (or `task_get` with `async_status.task_id`). `completed` gives `size_bytes` and `items[]`, one per part: `details.type` (`files`, `volume`, `database`) and `details.name`. `failed`: the reason is `error`, and nothing is kept in the store.

| response / `error` | fix |
|---|---|
| `422` `not supported` | a traditional PHP hosting account: it cannot be backed up |
| `404` `Backup container not found` | wrong store - `backup_container_list` |
| `Insufficient free space: need … bytes, have … bytes` | the server needs at least ~1 GB free to stage a backup: **server-health** |
| any storage message | `backup_container_test` the store |

## 3. Back up before risky work

Other skills send you here before a change that can lose data: a restore, a database import or delete, file edits on a live site, an app upgrade.

1. Does the project hold data - a database (`mysql_database_list`), a named volume, uploads under `/project`? If not (a static site from git), say so and go on.
2. `backup_container_list` - empty: tell the user there is no store; ask whether to set one up (step 1) or go on without a backup.
3. `backup_create`, then `backup_get` until `completed`. Tell the user the backup `id` and date - that is the undo.
4. `failed` → stop and report; do not start the risky work without the user's yes.

## 4. List backups

`backup_list` - `name`: newest first, each with `id`, `created_at`, `async_status`, `size_bytes`, `container`, `items`. Only a backup whose `async_status.backup` is `completed` can be restored. Show the user date, size and parts, not raw JSON.

## 5. Restore

**A restore overwrites the live project.** Show the user the backup's `created_at`, its parts and what each replaces (below), and get an explicit yes for that backup `id`. Offer a fresh backup first (step 3) so the restore itself can be undone.

`backup_restore` - `name`, `id`, `confirm: true`, and at most one filter:
- `only` - just these: `{"files": true}`, `{"databases": ["shop_wp"]}`, `{"volumes": ["data"]}`; names from the backup's `items[].details.name`
- `exclude` - everything but these, same shape

What it replaces:
- files - `/project` as a whole, by the backup's copy; anything added since is gone
- a volume - its whole contents
- a database - the dump is replayed into it: the tables it holds go back to that date, tables created since stay. The database must still exist - recreate a deleted one first (**database**)
- untouched: stored `env_vars`, domains, MySQL users and passwords

It answers `202` and runs in the background; the app is stopped, then started again - not rebuilt. Follow with `backup_get` until `async_status.restore` is `completed` or `failed`.

| response / `error` | means |
|---|---|
| `422` `Backup is not complete` | that backup never completed - pick another |
| `422` on `only` | `only` and `exclude` together |
| `No backup items match the restore filter` | a name that is not in this backup |
| `Restore failed: …` | the engine put back what it had replaced: the project is as before |
| anything mentioning rollback (`rollback was incomplete`, `rollback failed`) | the project may be half restored: stop, do not retry, report the `error` to the operator |

## 6. Verify and clean up

- `backup_get` - `async_status.restore: completed`, `error` null
- `container_list` - services running; `app_health_check` - `serving: ok`, `domain.verdict: ok`; fetch the domain and check it shows what the user expected for that date
- A restore does not rebuild: if the restored files hold other code than the running app, `project_rebuild` builds from them, and applies `env_vars` changed since the backup - ask first. Broken → **debug-project**.

`backup_delete` - `name`, `id`: `202`, removed from the store in the background; `backup_get` answers `404` once it is gone, or `async_status.delete: failed` with `error`. Name the backup's date when asking, and say so if it is the project's only completed backup.

## Rules

- Ask before `backup_restore`, `backup_delete`, `backup_container_delete`, and before changing a store's `driver`, `location` or `credentials`.
- `confirm: true` carries the user's yes for that one backup `id`; never send it on your own.
- Never ask for or repeat a store's secret: remote-store secrets go in on the engine host.
- Judge by `async_status`, not by the `202`.
- Backups run only when asked. For a schedule, the operator runs `pae project:backup:create` from cron on the host.
