---
name: app-admin
description: Manage the application inside a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - whether the app is managed at all, finishing its install, listing, adding and removing its users, resetting a password, a one-click admin login link, the admin login the engine generated, and WordPress WP-CLI (plugins, themes, users, site address). Use when asked to log in to, add a user to, reset a password in, finish installing, or run WP-CLI on an app hosted on a PanelAlpha Engine.
---

# Manage the app inside a project on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

These tools act on the application's own accounts (WordPress users, an n8n owner), not on MySQL users (**database**) or SSH/SFTP access (**access-and-jobs**).

## 1. Which kind of project is it?

`project_get` - `details.template`:
- `dind` - the app runs in containers of its own. App management (steps 2-5) may work; `wp_cli_run` does not
- anything else - traditional PHP hosting. `wp_cli_run` works (step 6); `app_info`, `app_install`, `app_role_list` and `app_user_*` answer `403` "App user management is only available for dind users"

## 2. Is the app managed?

`app_info` → `data`: the list of commands this app supports, e.g. `users:list`, `users:add`, `users:delete`, `users:reset-password`, `users:sso`, `roles:list`, `install`. Use only what it lists - a WordPress site lists all seven, others fewer.

Failures come back as `422` with the reason in the message:

| message | means | do |
|---|---|---|
| "App management is not supported for this application" | the engine has no management for this app - it knows only some apps, by the repository they were deployed from | log in through the app's own admin; `app_credentials_get` (step 5) may still hold a login |
| "The application is not running. Deploy or start the project, then try again." | the containers are down | **debug-project** |
| "WordPress is not installed yet." | the site was never installed | step 3 |
| "The application's management command failed. The engine log has the details." | the app's own command failed | **debug-project**; tell the user the engine's log has the cause |

## 3. Finish the install (`install` listed)

Only for an app that is not installed yet - on WordPress, a user listing that fails with "WordPress is not installed yet." Ask first: it creates the first admin.

`app_install` - all required:
- `url` - the site's address, `https://` plus the project's domain from `project_get`. WordPress stores it as its site address, and every link and the one-click login are built from it
- `title`, `admin_user`, `admin_email`
- `admin_password` - at least 8 characters

The password is stored as given: a `vault:` ref is not resolved here. Generate a long random one, hand it to the user once, and do not repeat it. It answers `204` when done. The user can also finish the app's own installer in the browser instead.

## 4. Users

- `app_role_list` (`roles:list`) → `data`: role names, e.g. `administrator`, `editor`. Read it before creating a user
- `app_user_list` → `data[]`: `id`, `username`, `email` (`""` when the app has none), `role`. The `id` is the `userId` for the calls below
- `app_user_create` - `login`, `email`, `password` (8+), `role` → `201`, the new user's `data.id`. Ask first
- `app_user_reset_password` - `userId`, `password` (8+) → `204`. Ask first
- `app_user_delete` - `userId` → `204`. Ask first, naming the user. **On WordPress the user's posts are deleted with them** - nothing reassigns them; say so before deleting an author

Passwords here are literal, never vault refs. Never ask the user to type one into chat: generate it and hand it over once, or skip the password entirely and give a one-click login (below) so the user sets their own in the app.

**One-click login** - `app_user_sso_create` - `userId` → `url`. Give it to the user at once:
- it logs whoever opens it in as that user - treat it like a password: never in a report, never repeated
- it works once and expires quickly - one minute on WordPress. Expired or used → mint a new one
- never open it yourself: redeeming it spends it and gives the session to you, not the user
- on WordPress it is built from the site address WordPress stores. After a domain change it points at the old one until that address is updated (step 6, or WordPress's Settings → General)

## 5. The login the engine generated

Some apps are seeded with an admin login the engine generated. First look without revealing it: `project_get` → `app_credentials`: `available`, `fields[]` (`name`, `kind` only), `login_url`.

Only when the user asks for the login: `app_credentials_get` → `data`: `available`, `login_url`, `created_at`, `fields[]` - `name`, `kind` (`username` / `email` / `password`), `value`.
- hand the values over **once**, with `login_url`, and tell the user to change the password in the app. Never repeat them, never put them in a summary or report
- they are what the app was first seeded with: a password changed in the app later is not reflected. If it no longer works, use step 4 (`app_user_reset_password` or a one-click login)
- `available: false` - the app declares no generated login

## 6. WordPress with WP-CLI (traditional PHP hosting only)

On a `dind` project `wp_cli_run` is refused with `422` "WP-CLI runs only on traditional PHP hosting projects": use steps 2-5 there.

`wp_cli_run` - `args`: the WP-CLI arguments as an array, without `wp`, e.g. `["plugin", "list", "--format=json"]`. It runs as the project's own user in the project's PHP container, and blocks until the command ends.
- `--path` - where WordPress is: `/home/<name>` plus the domain's `details.document_root` from `domain_list`, e.g. `--path=/home/shop/shop.example.com/public_html`. A path that is a domain's document root also runs WP-CLI on that domain's PHP version; otherwise PHP 8.3
- the answer is `exit_code`, `stdout`, `stderr` - HTTP 200 even when the command failed. Judge by `exit_code`

| task | `args` (plus `--path=...`) | writes? |
|---|---|---|
| version, plugins, themes | `core version`; `plugin list --format=json`; `theme list --format=json` | no |
| site address | `option get siteurl`; `option get home` | no |
| users | `user list --format=json` | no |
| updates | `plugin update --all`; `theme update --all`; `core update` | yes |
| new user | `user create <login> <email> --role=<role>` - WP-CLI generates the password and prints it once | yes |
| domain change | `search-replace https://<old> https://<new> --dry-run` first, then without `--dry-run`; then `option get siteurl` to confirm | yes |

Every command that writes: show the user the exact command and ask first. Before updates or a search-replace, offer a backup (**backup-restore**). A plugin update that fails for memory → **php-tuning**.

## Rules

- Ask before `app_install`, `app_user_create`, `app_user_reset_password`, `app_user_delete` and any WP-CLI command that writes.
- Seeded credentials, generated passwords and one-click links are secrets: hand them over once, never repeat them, never put them in a report.
- Never ask for a password in chat. App passwords are literal, not vault refs - generate one.
- Use only the commands `app_info` lists; branch on the error message, not on a guess.
