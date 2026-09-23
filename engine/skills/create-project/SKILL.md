---
name: create-project
description: Create a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) and deploy an app into it (git repo, archive URL or hand-written files), then verify it answers. Use when asked to create a project, deploy, redeploy, publish or host an app on a PanelAlpha Engine.
---

# Create a project on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Inspect the repo (git only)

`source_inspect`
- `source` - repo URL, e.g. `github.com/owner/repo`
- `branch` - another branch
- `git_token` - private repo: a `vault:<ref>` from step 2, never the token itself

Check:
- `deployable` - false comes with the reason
- `services` - does it need a database?
- `environment` - variable **names** to pass in `env_vars`
- `ports.unrouted` - a second web port (admin UI, websocket) the engine will not route by itself; see step 7
- `metadata.packages[].scripts` against `stages` - a `seed` script no stage runs is left undone on purpose. Tell the user it exists; run it only if they ask.

## 2. Secrets go through the vault

Never ask for a token, password or API key in chat, and never put one in a URL. The vault takes it from the user's browser straight to the engine:

1. `vault_secret_create` - `type`: the field the ref will ride in (`git_token`, `env_vars`), `purpose`: a label to recognise it later → `ref` (`vault:<id>`) and `url`
2. give the user the `url` to paste into
3. `vault_secret_status` - `ref` - until `status` is `filled` (`pending`: not yet; `expired`: mint a new slot)
4. pass the `ref` where the secret goes: `git_token`, or an `env_vars` value (`{"DB_PASSWORD": "vault:<ref>"}`)

A pasted secret is final: to replace one, `vault_secret_delete` it and mint a new slot. An unknown, unfilled or expired ref fails the call with `422` naming the field - never fall back to a literal. `scope: "global"` stores the engine's own Git token, used by every project that has none, so the user pastes it once.

## 3. Create the project

`project_create`
- `name` - short, lowercase, e.g. `shop`
- `email` - required
- `domain` - leave empty for a free `*.panelalpha.online` name with a trusted certificate; or the user's own domain together with `tunnel: "none"`
- `git_repo` - repo URL; this one call clones, builds and starts the app
- `git_branch` - branch
- `git_token` - private repo: the `vault:<ref>` from step 2
- `env_vars` - `{"KEY": "value"}`, stored and applied on every deploy; secrets as vault refs

It returns `202` with a task and deploys in the background: keep the task `id` for step 6.

A `422` lists **every** problem at once in `problems[]`. Fix all of them, then retry:

| `code` | fix |
|---|---|
| `name_taken`, `name_unavailable` | another `name` |
| `domain_taken`, `hostname_taken` | another domain, or none and let the engine choose |
| `allocation_failed` | the proxy would not register the name - retry with no `domain` |
| `template_not_found`, `template_conflicts_with_git`, `invalid_value` | correct the field the entry names |
| `repo-auth-failed`, `repo-not-found` | check the URL; private repo → step 2 for `git_token` |

## 4. Files without git

Call `project_create` without `git_repo`. The task ends `completed` with `details.waiting_for_files: true`: the account is ready and empty. Then, always under `/project/`:
- Archive URL: `file_upload` (`path: "/project"`, `file_url`) → `project_deploy_archive` (`zip_path: "/project/<file>.zip"`)
- A few files: `file_write` (`path: "/project/index.html"`, `contents`) → `project_rebuild`
- WordPress: upload the release zip from GitHub (wordpress.org returns 403), deploy it, then `wp_cli_run` `core config` / `core install` with `--path=/home/<name>/project` and `--url=<the project's domain>`

## 5. Database (if the app needs one)

`mysql_database_create` → `mysql_user_create` → `mysql_privileges_set`, then the credentials in `env_vars` on `project_rebuild`, password as a vault ref. Details: the **manage-database** skill.

## 6. Follow the deploy

After `project_create`, follow the task:
- `task_get` - `id` from step 3: `status` `queued` / `running` / `completed` / `failed` / `cancelled`, the first log lines and `next_after_id`
- `task_log_list` - `id`, `after_id: <next_after_id>` - only the new log lines (`stage`, `level`, `msg`)
- `completed` - `details.deployment_status` is `success`, or `partial` (step 7); `details.waiting_for_files: true` → step 4
- `failed` - the reason is `details.error`, the stage is in the last log lines. A failed create may roll the account back: `project_get` still finds it → fix and `project_rebuild`; 404 → fix and `project_create` again

`project_rebuild` and `project_deploy_archive` answer only when the deploy has finished - up to several minutes. **A client timeout on them is your timeout, not a failed deploy: it keeps running.** Do not call them again; follow it with `deploy_log_get`:
- `offset: 100000` - status only: `running` / `success` / `partial` / `failed` / `cancelled`, `stage`, `error`
- `offset: 0` - the full log (`next_offset` to continue)

`deploy_log_get` may answer 404 for a `project_create` deploy - read the task instead.

Deploys take ~5 s (static) to ~6 min (Laravel, Next.js). Poll every 20-30 s, and never start a second deploy of a project while one is `queued` or `running`.
Failed → use the **debug-project** skill.

## 7. Verify

- `project_get` - `deployment_status: success`, `health_healthy: true`. `partial` means the app answers but the engine found something wrong on the way to it: report every line of `details.deployment_warnings`.
- `app_health_check` - `serving: ok`; `domain.verdict: ok` (the domain reaches this app, not another one); `ports` - every published port and whether it answered
- fetch `https://<domain>/` - the app itself, not a placeholder page
- `project_inspect` - `ports.unrouted`: ports the app publishes that no domain reaches. `routable: true` (an admin UI, a websocket server) needs a `proxy_rule_create` to be reachable - tell the user and ask before exposing it. `routable: false` and `ports.refused` are datastores: never route them.

Report:
- the URL and the detected stack
- where the domain came from (`details.domain.source`), and `details.domain.fallback_reason` if set - a better name was not available
- the certificate a visitor sees: when `details.domain.tls_terminated_at` is `proxy`, it is the proxy's trusted one and `details.ssl` does not apply; on `engine` it is `details.ssl.status`, and only `trusted` may be called trusted
- any unrouted port with `routable: true`

## 8. Push to deploy (git projects, optional)

Offer it once the site works. `git_deploy_hook_create` - `provider` (`github`, `gitlab`, `bitbucket-cloud`, `bitbucket-data-center`) - returns the webhook `url` and a `secret` **shown once**: hand both to the user for their git host now. Read its `warning` to them: every push force-updates `~/project` to the repository. When `tls.state` is `self_signed`, pass on `tls.instructions` for their provider.

## Rules

- Ask before `project_delete`, `project_suspend` or any `*_delete`.
- Never ask for a secret in chat and never repeat one back: use the vault.
- Never show `.env` values; never run seed scripts unless the user asks.
- Never re-run a deploy call after a timeout; follow the one that is running.
- Branch on `problems[].code`, not on the message text.
