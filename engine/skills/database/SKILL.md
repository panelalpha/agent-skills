---
name: database
description: Manage MySQL for a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - create a database and user and grant privileges, inspect them, rotate a password and update the app, rename, revoke, delete, the connection host and port, phpMyAdmin single sign-on, the database limit, and importing a SQL dump. Use when a PanelAlpha Engine project needs a database, database credentials, phpMyAdmin access, or a dump imported.
---

# MySQL for a project on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`; the database as `dbname`, the MySQL user as `dbuser`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Names and passwords

Every database and user gets the project prefix `<project>_`: `wp` on project `shop` is `shop_wp`. The create calls add it when missing; every other call takes the name with or without it. Report the full name the response returns (`database`, `user`).
- database: letters, digits, `_`, `-`, not starting with a digit; at most 64 characters with the prefix
- user: the same characters, at most 32 with the prefix; `root`, `mysql`, `admin`, `administrator`, `sys` are refused
- password: 8-255 characters. **Not a vault ref** - `mysql_user_create` and `mysql_user_change_password` store `vault:...` as the literal password. Generate a long random one (24+ letters and digits) and never show it

A database and user both named `<project>_app` belong to the engine: it made them for an app whose recipe asked for a database, hands their credentials to the app as `DB_*` and `DATABASE_URL`, and sets that user's password again on every deploy. Leave them alone - no rotate, rename or delete.

## 2. Create

1. `mysql_database_create` - `dbname` → `database`. `422`: already exists, or `error_type: mysql_databases_limit_reached` (step 8)
2. `mysql_user_create` - `dbuser`, `password` → `user`
3. `mysql_privileges_set` - `dbuser`, `dbname`, `privileges`: `ALL PRIVILEGES`, or a comma-separated list **without spaces** (`SELECT,INSERT,UPDATE,DELETE`) of `ALTER`, `ALTER ROUTINE`, `CREATE`, `CREATE ROUTINE`, `CREATE TEMPORARY TABLES`, `CREATE VIEW`, `DELETE`, `DROP`, `EVENT`, `EXECUTE`, `INDEX`, `INSERT`, `LOCK TABLES`, `REFERENCES`, `SELECT`, `SHOW VIEW`, `TRIGGER`, `UPDATE`. Anything else is `422` `Invalid value.` It replaces what the user had on that database
4. Hand the app its credentials: `project_rebuild` with `env_vars` - the names the app reads (`source_inspect` `environment`, often `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`). `env_vars` merge with the project's. Follow the deploy as in **create-project**

## 3. Host and port

`mysql_server_info` → `host`, `port` (`3306`). One MySQL server shared by the engine's projects, reachable from inside the server only, never from the internet. The engine pins `host` into the app's containers only for its own `<project>_app` database; if an app with a database you created logs that it cannot resolve that host, use **debug-project**. A server installed without the shared MySQL answers these calls with an error: tell the operator.

## 4. Inspect

- `mysql_database_list` - every `database` with `size_bytes`; `mysql_database_get` - one
- `mysql_user_list` - every `user` with the `databases` it holds privileges on; `mysql_user_get` - one
- `mysql_privileges_get` - `dbuser`, `dbname` → `data`: that user's privileges on that database as a string, `""` for none
- `project_usage` - `mysql_databases.usage` against `mysql_databases.maximum` (`null` is no limit)

## 5. Rotate a password

1. Find where the app reads it: the `env_vars` key (`DB_PASSWORD`, `DATABASE_URL`). An app that wrote the password into its own config file at install will not pick up `env_vars` - say so, and ask before editing that file.
2. `mysql_user_change_password` - `dbuser`, `password` (generated, never shown). The old password stops working at once: the app fails until step 3 is deployed.
3. `project_rebuild` - `env_vars: {"DB_PASSWORD": "<the same value>"}` (and `DATABASE_URL` if the app reads it, password URL-encoded). Follow the deploy.
4. Verify: `app_health_check` `serving: ok`; `container_service_logs` (`service: "app"`) without access-denied errors.

## 6. Rename, revoke, delete

Check first whether the app still uses it (`mysql_user_list`, the project's `env_vars`).
- `mysql_user_rename` - `dbuser`, `new_dbuser` **without** the prefix - it is always added, so `shop_x` would become `shop_shop_x`. Privileges move with the user; the app's `DB_USERNAME` must follow (`project_rebuild` with `env_vars`)
- `mysql_privileges_revoke` - `dbuser`, `dbname`: every privilege of that user on that database. The user stays
- `mysql_user_delete` - `dbuser`: the user is dropped
- `mysql_database_delete` - `dbname`: the database **and all its data** are dropped, and every project user loses its privileges on it. No undo: back up first (**backup-restore** step 3)

## 7. phpMyAdmin

`phpmyadmin_sso_token_create` → `url` (`https://<main domain>/phpmyadmin/signon.php?pmassotoken=...`). A login link for the user:
- valid 5 minutes and for one use; a new one cancels any older one for the project
- logs in as `sso_<project>`, with every privilege on every database of the project - no password needed
- `404` when the project has no main domain; the domain must reach this server

Give it to the user to open at once. Do not open it yourself and do not paste it anywhere else.

## 8. Database limit

`project_update` - `mysql_databases_limit`: once the project has that many databases, `mysql_database_create` answers `422` with `error_type: mysql_databases_limit_reached`. No limit set is unlimited; `-1` is not - it refuses every new database. A limit is the operator's call: ask.

## 9. Import a dump

No import tool: use the account shell. Back up first (**backup-restore** step 3). A small dump can also go in through phpMyAdmin (step 7).

1. `ssh_run` - `command -v mysql mariadb`: which client the account has. Neither → stop and tell the operator.
2. Put the dump in the account home, outside the site: `file_upload` with `path: "/"` and `file_url` (or `file_name` + `file_contents` for a small one). Never under `/project` - that is the site.
3. A short-lived import user, so the app's password stays unknown and unchanged: `mysql_user_create` (`dbuser: import`, generated password), `mysql_privileges_set` `ALL PRIVILEGES` on the target database.
4. `ssh_run` - `command`: `MYSQL_PWD='<pw>' mysql -h <host> -P <port> -u <project>_import <database> < ~/dump.sql`, or `gunzip -c ~/dump.sql.gz | MYSQL_PWD='<pw>' mysql ...`; `timeout` up to `900`. Read `exit_code` and `stderr`. A dump that creates or switches to its own database (`CREATE DATABASE`, `USE`) is refused under another name - ask the user for one with the tables only.
5. `mysql_user_delete` the import user; `ssh_run` `rm ~/dump.sql`.
6. Verify: `mysql_database_list` `size_bytes` grew; `app_health_check` `serving: ok`.

## Rules

- Ask before `mysql_database_delete`, `mysql_user_delete`, `mysql_privileges_revoke`, `mysql_user_change_password`, `mysql_user_rename`, an import, or a limit change.
- Passwords: generated, never shown, never a vault ref in a `mysql_*` call; the same value goes into `env_vars`.
- Never show `.env` values, `DB_PASSWORD`, `DATABASE_URL`, a command holding a password, or the phpMyAdmin link to anyone but the user.
- Leave `<project>_app` to the engine.
- Back up before a delete, an import, or anything that writes rows.
