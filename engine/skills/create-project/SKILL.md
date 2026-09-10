---
name: create-project
description: Create a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) and deploy an app into it (git repo, archive URL or hand-written files), then verify it answers. Use when asked to create a project, deploy, redeploy, publish or host an app on a PanelAlpha Engine.
---

# Create a project on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? On the engine host `pae mcp:connect` lists the agents and prints the command for each.
Claude Code: `/plugin` → engine. Codex: `codex mcp add panelalpha-engine --url <url> --bearer-token-env-var PANELALPHA_MCP_TOKEN`.
OpenCode: `url` / `token` options on the plugin, or `PANELALPHA_MCP_URL` / `PANELALPHA_MCP_TOKEN`.

## 1. Inspect the repo (git only)

`source_inspect`
- `source` - repo URL, e.g. `github.com/owner/repo`
- `branch`, `git_token` - other branch / private repo

Check `deployable`, `services` (needs a database?) and `environment` (variables to pass in `env_vars`).

## 2. Create the project

`project_create`
- `name` - short, lowercase, e.g. `shop`
- `email` - required
- `domain` - leave empty for a free `*.panelalpha.online` name with a trusted certificate; or the user's own domain together with `tunnel: "none"`
- `git_repo` - repo URL; this one call clones, builds and starts the app
- `git_branch`, `git_token` - branch / private repo (never put a token in the URL)
- `template: "dind"` - instead of `git_repo`, when the files come in step 3
- `env_vars` - `{"KEY": "value"}`, stored and applied on every deploy

On an error read `problems[]` (`name_taken`, `domain_taken`, `template_not_found`, ...), fix all of them, then retry.

## 3. Files without git

Always under `/project/`.
- Archive URL: `file_upload` (`path: "/project"`, `file_url`) → `project_deploy_archive` (`zip_path: "/project/main.zip"`)
- A few files: `file_write` (`path: "/project/index.html"`, `contents`) → `project_rebuild`
- WordPress: upload the release zip from GitHub (wordpress.org returns 403), deploy it, then `wp_cli_run` `core config` / `core install` with `--path=/home/<name>/project` and `--url=<the project's domain>`

## 4. Database (if the app needs one)

`mysql_database_create` → `mysql_user_create` → `mysql_privileges_set`
- names get the project prefix: `wp` becomes `shop_wp`
- host `database-users.shared-hosting.palocal`, port 3306
- pass the credentials in `env_vars` on `project_rebuild`

## 5. Check status

`deploy_log_get`
- `offset: 100000` - status only: `running` / `success` / `failed`, `stage`, `error`
- `offset: 0` - the full log

Deploys take ~5 s (static) to ~6 min (Laravel, Next.js). If the call times out the deploy keeps going: poll every 20-30 s and **never re-run `project_create`**.
Failed → use the **debug-project** skill.

## 6. Verify

- `project_get` - `deployment_status: success`, `health_healthy: true`
- `app_health_check` - `serving: ok`
- fetch `https://<domain>/` - the app itself, not a placeholder page

Report: the URL, the detected stack, where the domain came from (`details.domain.source`) and the certificate (`details.ssl.status`; call it trusted only if it says `trusted`).

## Rules

- Ask before `project_delete`, `project_suspend` or any `*_delete`.
- Never show `.env` values; never run seed scripts unless the user asks.
- Branch on `problems[].code`, not on the message text.
