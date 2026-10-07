---
name: access-and-jobs
description: Give people access to a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) and schedule work - SFTP and FTP accounts, a password in front of the whole site, cron jobs, and the per-project account limits. Use when asked to give someone SFTP/FTP access or upload credentials, rotate or revoke such access, lock a site or a staging copy behind a password, or run a task on a schedule on a PanelAlpha Engine.
---

# Access and scheduled jobs on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Passwords

No field in this skill resolves vault refs: the `password` of `sftp_account_create` / `_update`, `ftp_account_create` / `_update` and `project_password_set` stores a `vault:<id>` as the literal password. So:
- generate a strong random one yourself (20+ letters and digits) - never ask the user to type one into the chat
- hand it to the user **once**, with the rest of the login, and never repeat it, log it or write it into a file
- the engine keeps only a hash and cannot show it again. Lost → set a new one with the `_update` call (or `project_password_set` again)

For SFTP prefer a key: the user's public key is not a secret.

## 2. SFTP (offer this first)

`sftp_account_create`
- `sftp_username` - must start with `<project name>_`, e.g. `shop_dev`; letters, digits and `_`, at most 32
- `auth_method` - `password`, `public_key`, or both as `password,public_key`; each one listed needs its value
- `public_key` - one OpenSSH public key line, from the user; `password` - at least 8 characters (step 1)

Give the user: the engine server's address, port `2222`, the account name, and the key or password. The account is confined to the project's home and writes as the project; the app's files are under `/project/`. Code uploaded there reaches a built app on the next `project_rebuild`.

- `sftp_account_list` - `username`, `auth_method`
- `sftp_account_update` - `sftpUser`, `auth_method` (required), plus the value each method needs: rotate a password, swap a key, or switch methods
- `sftp_account_delete` - `sftpUser`. Ask first; the user loses access at once

## 3. FTP

Only when the user's tool needs FTP. `ftp_account_create`
- `user` - letters and digits, at most 32; the login becomes `<user>@<domain>`
- `domain` - one of this project's domains, else 422 on `domain`
- `password` - at least 8 characters (step 1)
- `directory` - the folder the account is locked into, relative to the project home: `/project` for the app's files. It must already exist; empty means the whole home
- `quota` (MB) or `unlimited_quota: true`

Give the user: the engine server's address, port `21` (passive ports `30000-30009`), the login `<user>@<domain>`, the password.

- `ftp_account_list` - `user`, `directory`, `details` (quota), `disk_usage_mb`
- `ftp_account_update` - `ftpUser` (`<user>@<domain>`), `password`, `quota` / `unlimited_quota`. The directory cannot change: delete and create again
- `ftp_account_delete` - `ftpUser`. Ask first

## 4. Account limits

A create past the project's limit answers 422 with `error_type` `sftp_accounts_limit_reached` or `ftp_accounts_limit_reached`. `project_usage` shows the current counts. Raising it is `project_update` (`sftp_accounts_limit`, `ftp_accounts_limit`) - the operator's decision: ask first.

## 5. Password-protect the site

`project_password_set` - `password` (step 1):
- covers **every domain** of the project at once; there is no per-domain or per-path setting
- visitors get a password page with a session cookie, or the browser's own prompt - the operator picks one for the whole server. Tools and scripts send HTTP basic auth with any username and this password
- everything calling the site is gated too - payment callbacks, uptime monitors, API clients - unless it sends the password. Say so before setting it on a live site
- `project_get` → `details.password_protection: true` confirms it. To change the password, call it again
- `project_password_unset` makes the site public again. Ask first

Typical use: a staging copy (**git-release**) or a site not ready to launch.

## 6. Cron jobs

Only for PHP hosting projects: `project_get` → `details.template` other than `dind`. A `dind` project - almost every app deployed from a repository or archive - answers 422 on create and update: schedule the work inside the app instead, e.g. a scheduler service in its compose file or the framework's own scheduler.

`cron_job_create`
- `command` - one line. It runs in the project's PHP container as the project's user, with the home at `/home/<name>/`: use absolute paths, e.g. `/usr/bin/php /home/<name>/public_html/cron.php`, or `cd /home/<name>/public_html && ...`
- the schedule as five crontab fields, each a string: `minute`, `hour`, `day_of_month`, `month`, `day_of_week`. Every 15 minutes: `*/15`, `*`, `*`, `*`, `*`; daily at 03:00: `0`, `3`, `*`, `*`, `*`. Each field is checked; a 422 names the one crontab would refuse. No `@daily` shortcuts
- output is kept nowhere: append `>> /home/<name>/cron.log 2>&1` to the command when the user wants to see it

The answer carries `hash`, the job's id. It is derived from the schedule and the command, so `cron_job_update` returns a **new** `hash` - use that one afterwards, or read `cron_job_list` again.
- `cron_job_list` - every job with its `hash` and fields
- `cron_job_update` - `hash` plus all six fields again, all required
- `cron_job_delete` - `hash`. Ask first

## Rules

- Ask before any `*_delete`, `project_password_unset`, or raising a limit with `project_update`.
- Passwords: generate, hand over once, never repeat; never ask for one in chat, never pass a vault ref in these fields.
- Never show `.env` values or another account's credentials.
- Report what the tool returned, not what should have happened.
