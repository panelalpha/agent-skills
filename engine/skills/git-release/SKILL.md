---
name: git-release
description: Day-two git and release work on a PanelAlpha Engine project (the hosting engine, MCP on port 2011) - see what is deployed, pull and redeploy new commits, change branch, roll back to an earlier commit, attach a repository to a project deployed from files, deploy keys, push-to-deploy webhooks, and staging copies promoted to production. Use when asked to update, pull, roll back, revert, switch branch, rotate a webhook or git token, set up staging, or push staging live on a PanelAlpha Engine.
---

# Git and releases on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Where the checkout stands

`git_status` first - `fetch: true` refreshes `commits_behind` / `commits_ahead` from the remote. Leave `path` out: it defaults to the app's checkout.
- `managed_by: deploy` - created with `git_repo`. `git_pull`, `git_change_branch` and `git_revert` rebuild the app afterwards, as a task (step 2). `project_rebuild` redeploys the same commit; it never pulls.
- `managed_by: site_git` - attached later with `git_connect`. The git tools change files only, nothing is rebuilt: follow with `project_rebuild`.
- also `connected`, `branch`, `dirty`, `remote_url`; `connecting: true` - a connect is still fetching: wait, do not connect again

`git_commits` (`branch`, `limit`) - `hash`, `short_hash`, `subject`, `author`, `date`. `git_branches` - `name`, `current`, `tracking`, including branches only the remote has.

## 2. Follow a change that rebuilds

On `managed_by: deploy` the request is checked at once and answers with a task `id`:
- `task_get` (`id`) until `completed`, `failed` or `cancelled`; `task_log_list` (`id`, `after_id`) for new lines. `details.commit` is what was deployed; a failure is in `details.error` and `details.problems` → **debug-project**
- a new version that fails leaves the previous one serving, its checkout put back
- `409` - a deploy is already queued or running: follow the `task_id` it names, or `deploy_log_get` (`offset: 100000`) when it is null. Never call again
- `400` - git could not read the remote; `503` - the project could not be locked, try again; `422` - refused, see each step

Then verify as in **create-project** step 7: `project_get`, `app_health_check`.

## 3. Pull new commits

`git_pull` - `strategy`:
- `ff` (default) - fast-forward only. Refused, naming the paths, when history diverged (a force-push) or a local edit or untracked file sits where an incoming commit writes; nothing changes
- `force` - `reset --hard` to the remote branch plus `clean -fd`: local edits and untracked files are lost. **Ask first**
- `push_first` - commits local changes, merges the remote branch in, then pushes. Writes to the repository: ask first. 422 on a merge conflict (the paths are named) or unrelated histories

## 4. Change branch

`git_change_branch` - `branch`. 422 when the tree is `dirty` or the remote has no such branch (the message suggests the closest one). On `deploy` it also becomes the branch later deploys and pushes use.

## 5. Roll back to an earlier commit

`git_revert` - `ref`: a full or short `hash` from `git_commits`. It runs `reset --hard <ref>` and `clean -fd`: the branch moves back, local edits and untracked files are deleted (git-ignored files stay). Without `ref` it only discards local changes.
- Only commits already in the checkout: a deploy clones at depth 1, so a fresh project may list just one; each pull adds its commits. Otherwise 422 `git_ref_not_found`. `HEAD~1` and the like are refused - pass the hash.
- It rolls back code only, never data in a database.
- It holds until the next `git_pull` or push-to-deploy, which brings the newer commits back. Say so; delete the hook (step 7) if the user wants the rollback to stay.
- **Confirm first**: the target commit, and that local changes go.

## 6. Attach a repository to a files project

`git_connect` - `repo_url` (HTTPS, or `git@host:owner/repo.git` with a deploy key), `branch`:
- fetches the branch and checks it out over `/project`: files the repository also has are overwritten, others stay. Ask first; offer `backup_create` before
- the result is `managed_by: site_git`: a pull or a push-to-deploy only updates files - `project_rebuild` after each. For push-to-rebuild, a new project with `git_repo` is the way (**create-project**)
- `sync_error` - connected, but the fetch failed: fix access, then `git_pull`
- `git_disconnect` - removes `origin`, the git metadata and the checkout's webhook; files stay. 422 on `managed_by: deploy`

Private repositories:
- **Deploy key** (preferred - no secret passes through the chat): `git_deploy_key_create` → `public_key`; `host` only for a server other than github.com, gitlab.com or bitbucket.org, then have the user check the returned `fingerprints`. The user adds `public_key` in the repository's settings as a deploy key - read-only unless they want `git_push` - then `git_connect` with the SSH URL. Without a key: 422 `repo_url_ssh_needs_deploy_key`. One key per project; `git_deploy_key_delete` (ask first) stops SSH access - the user removes it from the repository too.
- **Token**: `git_connect` `token` and `git_update_credentials` `token` take the token itself - they **do not resolve vault refs**; a `vault:<id>` is stored as the token. Never ask for it in chat: use a deploy key, or have the user set it on the engine host with `pae git:update-credentials <name> --token=<token>`. On `deploy` the new token is also what later deploys clone with.

## 7. Push to deploy

Creating the hook: **create-project** step 8. Afterwards:
- `git_deploy_hook_show` - `url` and `deliveries`, newest first: `outcome` (`queued`, `ignored`, `rejected`, `coalesced`), `result` (`deployed`, `partial`, `deploy_failed`, `pull_refused`, `superseded`; null while queued), `detail` for the reason. `url_changed_since_registration: true` - the engine's address moved: the user changes the webhook from `registered_url` to `url`. The secret is never shown again
- on `deploy` every push force-updates `/project` to the branch (local changes discarded) and rebuilds; on `site_git` it only fast-forwards, and a refusal is `pull_refused`
- `git_deploy_hook_rotate` - when the URL or secret leaked: new `url` and `secret`, shown once - hand both to the user now; the old URL answers 404 at once. Ask first
- `git_deploy_hook_delete` - the URL answers 404 and the history is gone; the user removes the webhook on the git host. Ask first

## 8. Push changes back to the repository

`git_push` commits **every** change in the tree itself (untracked files included, message "Sync from PanelAlpha") and pushes to the connected branch. 422 `Pull first.` when behind; `nothing_to_push: true` when clean. Needs write access. Show `git_status` and ask first.

## 9. Staging and promotion

`project_staging` - `name` (live), optional `new_name`, `domain`:
- copies the home with `/project`, the app's named volumes (a database running inside the app included), limits and settings. **Not copied**: databases made with `mysql_database_create`, FTP/SFTP accounts, subdomains, dedicated IPs - check which database the copy is configured to use before anyone writes to it
- domain: `staging.<live domain>` (or `staging<NNNN>.<live domain>`) unless given; the user's own name must point at this host
- the live app is stopped while its data is copied - tell the user to expect a short outage
- `202` with the new project and a `task_id`: `task_get`, or `project_get` on the new name until `details.async_status.staging` is `completed` or `failed`. A failed copy deletes the new project; the task keeps the reason
- one staging per live project. `project_get` shows the pair: `staging` on the live project, `staging_of` on the copy

`project_push` - `name` (source), `target` (its pair; either direction):
- **replaces the target's whole home** - `/project`, uploads, everything - with the source's, and swaps in the source's named volume data. Whatever the target wrote since the copy (orders, sign-ups in the app's own database) is lost; there is no undo. Domains, `mysql_database_create` databases and FTP/SFTP accounts stay as they were. Both apps stop during the copy
- **Confirm** with both names and what is lost; offer `backup_create` of the target first and wait for `backup_get` to report it complete
- `202`, no task: `project_get` on the target until `details.async_status.push` is `completed` or `failed` (`details.error`). `409` while either project is busy

`project_clone` - `name`, optional `new_name`, `domain`: an unpaired copy, same content and outage rules, cannot be pushed. It answers only when the copy is done. A failure deletes the copy and returns `problems[]` (`clone_failed`, or the code of a recognised cause).

## Rules

- Ask before `git_revert`, `git_pull` with `force`, `git_push`, `git_connect`, `project_push` or any `*_delete` / `*_rotate`.
- Never ask for a git token in chat and never put one in `token`: deploy key, or the user sets it on the host.
- Show a webhook `secret` once, to the user only; never repeat it.
- Never call a git change again after a timeout or `409`; follow the task.
- Branch on `problems[].code`, not on the message text.
