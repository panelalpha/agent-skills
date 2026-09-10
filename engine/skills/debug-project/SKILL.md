---
name: debug-project
description: Debug a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - a failed deploy, a site that is down or returns 502/504, the wrong content, or a crash-looping container. Use when a PanelAlpha Engine project is broken or not behaving as expected.
---

# Debug a project on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? On the engine host `pae mcp:connect` lists the agents and prints the command for each.
Claude Code: `/plugin` → engine. Cursor: Customize → engine → set `PANELALPHA_MCP_URL` and `PANELALPHA_MCP_TOKEN`.
Codex: `codex mcp add panelalpha-engine --url <url> --bearer-token-env-var PANELALPHA_MCP_TOKEN`.
Grok: `PANELALPHA_MCP_URL` / `PANELALPHA_MCP_TOKEN` in the environment, or `grok mcp add --transport http panelalpha-engine <url> --header "Authorization: Bearer <token>"`.
OpenCode: `url` / `token` options on the plugin, or `PANELALPHA_MCP_URL` / `PANELALPHA_MCP_TOKEN`.

## 1. Check status

- `project_get` - `deployment_status`, `health_healthy`, `deploy_port`, `app_port`
- `deploy_log_get` with `offset: 100000` - `status`, `stage`, `error`

Still `running`? Wait and poll every 20-30 s; it is not a failure.

## 2. Read the failure code

A failed deploy returns `problems[].code`. Show the user the `message` and fix by code:

| code | fix |
|---|---|
| `php-version-mismatch`, `php-extension-missing` | fix `composer.json`, or set `image:` in `/project/.panelalpha/panelalpha.yaml` |
| `node-engine-mismatch`, `go-toolchain-too-old` | fix `.nvmrc` / `engines.node` / `go.mod`, or set `image:` |
| `composer-unresolvable`, `dependency-*`, `missing-build-script` | fix the package files with `file_write`, then `project_rebuild` |
| `disk-full`, `out-of-memory` | raise `disk_space_limit` / `memory_limit` with `project_update`, then rebuild |
| `registry-rate-limited`, `base-image-unavailable` | wait, then `project_rebuild` |
| `env-validation-failed`, `database-auth-failed` | correct `env_vars` or the MySQL password, then rebuild |
| `repo-auth-failed`, `repo-not-found` | check the URL, pass `git_token` |
| `app_did_not_start` | go to step 3 |
| anything else | `deploy_log_get` from `deploy_log_offset` - the command output is there |

## 3. Read the app logs

- `container_list` - is `app` running or restarting?
- `container_service_logs` - `service: "app"`, `lines: 200`

A restart loop usually means the app listens on `127.0.0.1` instead of `0.0.0.0`, or on the wrong port.

## 4. Look inside

`ssh_run`
- `command` - e.g. `ls -la project`, `curl -si http://127.0.0.1:<port>/`
- `cwd` - defaults to the account home

Compose / Dockerfile apps: `docker compose exec -T -w <dir> <service> <cmd>` with `cwd: /home/<name>/project`.

## 5. Match the symptom

- **502/504** - `app_port` differs from `deploy_port` → `project_rebuild`; proxy logs via `domain_log_list`
- **Welcome page** - files not in `/project` (`file_exists`), or the archive was never deployed
- **Directory listing or raw PHP** - wrong detection: write `/project/.panelalpha/panelalpha.yaml` with `platform:` (and `docroot: public` for Laravel-style apps)
- **Empty data** - migrations ran but seeds did not; ask the user before seeding
- **Certificate `self_signed`** - normal for an engine-signed domain, not a deploy fault
- **"Deployed as X, files say Y"** - `project_inspect`, read `drift`

## 6. Fix and redeploy

- `project_rebuild` - `env_vars`, `stages`, `zip_path`
- `container_project_action` - `restart` a hung app
- `project_update` - `memory_limit`, `disk_space_limit`

Report the cause (the code or log line), what you changed, and the new `deployment_status`.

## Rules

- Ask before `project_delete`, `project_suspend` or any `*_delete`.
- Never show `.env` values; never seed or write rows unless the user asks.
- Diagnose from tool output, not from what should have happened.
