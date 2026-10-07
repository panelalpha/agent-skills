---
name: php-tuning
description: Tune PHP for a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - switch a domain's PHP version, raise memory_limit, upload_max_filesize, post_max_size or max_execution_time, and confirm the change took. Use when a PanelAlpha Engine site needs another PHP version, hits "Allowed memory size exhausted", rejects large uploads, times out, or the user asks for php.ini changes.
---

# PHP tuning on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Project tools take the project as `name`; the `domain_php_*` tools take only `domain`, the exact name (not an alias).

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Which kind of project

`project_get` - `details.template` and `details.git_repo`:
- `dind`, or any git project - **container app**: PHP comes from the app's own image. `php_ini_get` / `php_ini_set` answer `422`; `domain_php_version_set` and `domain_php_directives_set` answer `204` and change nothing the app reads. Go to step 5
- anything else - **classic PHP hosting** (the webserver plus a PHP handler per version): steps 2-4

`project_create` over MCP makes container apps unless it is given another `template`.

## 2. PHP version (classic)

- `php_version_list` → `data`, e.g. `["8.4", "8.3", "8.2"]` - the only values accepted
- `domain_php_version_get` - `domain` → `data`; a domain never set reports the first listed version
- `domain_php_version_set` - `domain`, `version: "8.3"` → `204`; `422` on `version` ("Invalid value") when it is not installed. Takes effect at once: the vhost is rebuilt and that version's handler started. Each domain has its own

Ask before switching a live site - an old app can break on a newer PHP. Directives set with `php_ini_set` belong to one version: after a switch, the new version's set applies, so carry them over (step 3).

## 3. Directives: two places (classic)

| | `php_ini_set` | `domain_php_directives_set` |
|---|---|---|
| arguments | `name`, `php_version`, `settings` | `domain`, `settings` |
| scope | the whole project, one PHP version | one document root - every domain sharing it |
| stored in | the project's custom php.ini for that version | `.user.ini` in the domain's document root |
| takes effect | at once - that version's handler restarts; if no domain runs it yet, when one does | on later requests, no restart - PHP caches `.user.ini` for `user_ini.cache_ttl`, 300 s by default |

The `.user.ini` wins over the project file for the same directive. Use `php_ini_set` for project-wide limits, `domain_php_directives_set` for one site among several.

Both **replace the whole set**. Read first - `php_ini_get` (`name`, `php_version`), `domain_php_directives_get` (`domain`) - merge, then set. Values are strings, flat, no sections: `{"memory_limit": "512M"}`. `domain_php_directives_set` with `settings: {}` deletes the file. It is the same `.user.ini` an app may ship in its document root: setting it overwrites the app's own.

## 4. Typical asks (classic)

A classic project starts with `upload_max_filesize` and `post_max_size` at `1024M` and `max_execution_time` at `600`.
- "Allowed memory size of N bytes exhausted" - `memory_limit`, e.g. `"512M"`. Raise it in steps; `"-1"` removes the limit and lets one request eat the project's memory
- upload refused as too large - `upload_max_filesize` and `post_max_size` together, `post_max_size` at least as large. Already above the file's size? The limit is elsewhere: the app's own setting, or a blocked request (**blocked-request**)
- script stops after N seconds - `max_execution_time`, in seconds, e.g. `"300"`

## 5. Container apps

- **Version** - chosen at every deploy from `composer.json` `require.php` and the PHP constraints of the packages in `composer.lock`: the lowest minor that satisfies all of them; no `composer.json` gets the default. Change the constraint (and the lock to match), then `project_rebuild`. An app with its own Dockerfile or compose names PHP in its `FROM`. A `php-version-mismatch` failure → **debug-project**
- **Directives** - a PHP app the engine built runs on Apache and honours `.htaccess` in its document root (the repo root, or `public/` for Laravel-style apps). Add lines such as `php_value memory_limit 512M`, `php_value upload_max_filesize 64M`, `php_value post_max_size 64M`. Read the existing file first (`file_download`, `path` under `/project/`) - Laravel's `public/.htaccess` is its front controller - write it back whole with the lines added (`file_write` replaces the file), then `project_rebuild`. An app with its own Dockerfile or compose sets php.ini in its image
- **Check** - `ssh_run` - `command: "docker compose exec -T app php -r 'echo PHP_VERSION;'"`, `cwd: /home/<name>/project`. The CLI does not read `.htaccess`: confirm directives in the app itself (its system-info page, or the upload that failed before)

## 6. Confirm it took (classic)

`php_ini_get` and `domain_php_directives_get` only read the files back. Prove the value PHP actually uses:
1. `domain_get` - `name`, `domain` → `details.document_root`
2. `file_write` - `path: "<document_root>/pa-check-<random>.php"`, `contents: "<?php echo PHP_VERSION, ' ', ini_get('memory_limit'), ' ', ini_get('upload_max_filesize'), ' ', ini_get('post_max_size'), ' ', ini_get('max_execution_time');"`
3. fetch `https://<domain>/pa-check-<random>.php`
4. `file_delete` the file at once

After `domain_php_directives_set`, a check within 5 minutes may still show the old value - wait and fetch again before calling it failed.

Report the domain, the PHP version, each directive before and after, and where it was set.

## Rules

- Ask before changing a live site's PHP version or rewriting an app's `.htaccess`.
- Read before set: both directive tools replace the whole set.
- Never leave the check file behind; give it a random name.
- Never show `.env` values or credentials.
