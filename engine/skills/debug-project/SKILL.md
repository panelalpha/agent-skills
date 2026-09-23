---
name: debug-project
description: Debug a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - a failed deploy, a site that is down or returns 502/504, the wrong content, or a crash-looping container. Use when a PanelAlpha Engine project is broken or not behaving as expected.
---

# Debug a project on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Check status

- `project_get` - `deployment_status`, `health_healthy`, `deploy_port`, `app_port`
- Deployed by `project_create`: `task_get` with the task `id` - `status`, `details.error`; `task_log_list` with `after_id` for the log lines
- Deployed by `project_rebuild` / `project_deploy_archive`: `deploy_log_get` with `offset: 100000` - `status`, `stage`, `error`

Still `queued` or `running`? Wait and poll every 20-30 s; it is not a failure, and a client timeout on the deploy call is not one either - never start a second deploy. Stuck (a stage not advancing for many minutes, no new log lines): `deploy_cancel`, or `task_cancel` for a `project_create` task.

`partial` is not a failed deploy: the app answers, and `details.deployment_warnings` says what is wrong on the way to it (the domain, the proxy, the port). Fix from those lines.

## 2. Read the failure code

A failed deploy returns `problems[].code`. Show the user the `message` and fix by code:

| code | fix |
|---|---|
| `php-version-mismatch`, `php-extension-missing` | fix `composer.json`, or set `image:` in `/project/.panelalpha/panelalpha.yaml`; `php_version_list` says what the host has |
| `node-engine-mismatch`, `go-toolchain-too-old` | fix `.nvmrc` / `engines.node` / `go.mod`, or set `image:` |
| `composer-unresolvable`, `dependency-*`, `missing-build-script` | fix the package files with `file_write`, then `project_rebuild` |
| `disk-full`, `out-of-memory` | step 6 first, then raise `disk_space_limit` / `memory_limit` with `project_update` and rebuild |
| `registry-rate-limited`, `base-image-unavailable` | wait, then `project_rebuild` |
| `env-validation-failed`, `database-auth-failed` | correct `env_vars` or the MySQL password (secrets as vault refs), then rebuild |
| `repo-auth-failed`, `repo-not-found` | check the URL; a private repo needs `git_token` as a `vault:<ref>` (see **create-project**) |
| `app_did_not_start` | go to step 3 |
| `deploy_cancelled` | somebody called `deploy_cancel` - nothing to fix |
| `deploy_failed`, or any code not listed | the engine did not recognise the failure: read the log from `deploy_log_offset` with `deploy_log_get` (a `project_create` deploy: `task_log_list`) - the command's own output is there |

## 3. Read the app logs

- `container_list` - is `app` running or restarting?
- `container_service_logs` - `service: "app"`, `lines: 200`
- `app_health_check` - `serving` (`ok`, or what is served instead), and `checks`: each names a stable id and, where it can, what to do

A restart loop usually means the app listens on `127.0.0.1` instead of `0.0.0.0`, or on the wrong port.
A compose app that restarts a few times with `ECONNREFUSED` against its own database and then settles is racing its database at startup, not broken: read to the end of the logs before diagnosing.

## 4. Ports and routing

`app_health_check` probes every published port from inside the account (`ports`), then asks the same thing through the webserver (`domain.verdict`):

| `domain.verdict` | means | do |
|---|---|---|
| `ok` | the webserver serves this app for the domain | still broken from outside → DNS, the tunnel or the user's network, not the app |
| `not_routed` | the webserver answered its own 404: no vhost for this name | `project_rebuild` re-renders the vhosts |
| `differs` | something answered, but not this app | `domain_find` - is the name on another project? `proxy_rule_list` for a rule pointing elsewhere |
| `unreachable` | the engine's webserver did not accept the connection | not the app: `domain_log_list`, and check another project - if every site is down it is the host, see step 9 |
| `skipped` | no domain yet, or the app answers on no port | nothing to compare - fix the app first (step 3) |

`project_inspect` → `ports` says which ports the engine routes:
- `routed` - the one port the domain reaches
- `unrouted` - published but reached by no domain. `routable: true` (a second web service: admin UI, websocket, API) needs `proxy_rule_create` - the entry's `hint` says how; copy the `upstream_*` values from the project's existing rule in `proxy_rule_list`. Ask before exposing it.
- `refused` / `routable: false` - a datastore; a rule would point the site at a database. Never route it.

"The admin panel does not open" on an app whose main page works is almost always an `unrouted` port.

## 5. Look inside

`ssh_run`
- `command` - e.g. `ls -la project`, `curl -si http://127.0.0.1:<port>/`
- `cwd` - defaults to the account home

Compose / Dockerfile apps run one level in: `docker compose exec -T -w <dir> <service> <cmd>` with `cwd: /home/<name>/project`. Pass `-w` - the image's own WORKDIR is often the wrong half of a monorepo.

## 6. Resources

Before raising a limit, look: `project_usage` for the project's disk and memory, `metrics_latest` for the whole server. A server that is itself out of memory or disk is not fixed by a higher project limit - tell the user.

## 7. Match the symptom

- **502/504** - `app_port` differs from `deploy_port` → `project_rebuild`; proxy logs via `domain_log_list`
- **Welcome page** - files not in `/project` (`file_exists`), or the archive was never deployed
- **Directory listing or raw PHP** - wrong detection: write `/project/.panelalpha/panelalpha.yaml` with `platform:` (and `docroot: public` for Laravel-style apps)
- **Part of the app unreachable** - step 4, `ports.unrouted`
- **Empty data** - migrations ran but seeds did not; ask the user before seeding
- **Certificate `self_signed`** - normal for an engine-signed domain, not a deploy fault. On a `*.panelalpha.online` name (`details.domain.tls_terminated_at: proxy`) visitors get the proxy's trusted certificate whatever `details.ssl` says
- **"Deployed as X, files say Y"** - `project_inspect`, read `drift`

## 8. Fix and redeploy

A fix that edits a working site's files, env vars or database: take a backup first (**backup-project** skill), when the data matters.

- `project_rebuild` - `env_vars`, `stages`, `zip_path`
- `container_project_action` - `restart` a hung app
- `project_update` - `memory_limit`, `disk_space_limit`

Report the cause (the code or log line), what you changed, and the new `deployment_status`.

## 9. The engine is at fault

When the evidence points at the engine rather than the app - a green deploy that serves nothing, a code that contradicts the log, the same failure on a stock sample app - offer `bug_report_create`: `name` (the project), `title` (the symptom, not the incident), `description`, `area` (`deploy`, `domains`, `ssl`, ...), `severity`. The engine attaches the inspection, health probe and log tail itself, redacted; `contact` only if the user gives one. Ask before filing, and show the user the report the response returns.

## Rules

- Ask before `project_delete`, `project_suspend`, `proxy_rule_create`, `bug_report_create` or any `*_delete`.
- Never show `.env` values; never seed or write rows unless the user asks.
- Never ask for a secret in chat: use the vault.
- Diagnose from tool output, not from what should have happened.
