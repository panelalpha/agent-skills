---
name: server-maintenance
description: Operator changes to a PanelAlpha Engine host (the hosting engine, MCP on port 2011) - updating the engine, the engine's own certificate on port 2011, how project certificates are issued (ACME, shared zones), outgoing mail, the webserver, and extra IP addresses for projects. Every change is confirmed first. Use when asked to update or upgrade the engine, set up mail or a smarthost, get a trusted certificate for the engine, switch sites to Let's Encrypt, change the webserver, or assign an IP on a PanelAlpha Engine.
---

# Server maintenance on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every project tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

Each change here touches every project on the server. For each one: read the state, tell the user what will change and what it costs (a restart, sites offline), act only on a yes, read the state again. Run **server-health** before and after.

With tool search on, none of these tools is listed up front: find them with `search_tools`, run them with `execute_tools`. One that cannot be found is withheld on this engine - deletes under a "change but not delete" ceiling; every change, and `system_exim_config_get` (it returns mail passwords), under "look only". The operator offers it with `pae configure mcp-tokens` (`pae mcp:tool:list` shows what is offered), then reconnects the assistant.

## 1. Read the state

`system_info` - `version`, `url`, `mcp_url`, `cert_domain`, `served_certificate` (`status`, `names`, `days_remaining`), `sites_base_domain`, `sites_certificates`, `webserver` (`name`, `slug`), `latest_update`, `latest_webserver_change`, `default_ipv4`, `default_ipv6`. Then the `*_get` or list call of the section you are in.

## 2. Update the engine

`system_update` - no arguments. It installs the newest released engine in the background and answers at once. `422` "Update script is already running": one is in progress - never start another.
- Before: note `version` and `latest_update.started_at`. Tell the user the engine restarts - this MCP connection drops for about a minute - and that hosted apps are not rebuilt. There is no automatic way back.
- Follow: `system_info` every 30 s; failed calls while it restarts are expected. It has finished when `latest_update.started_at` is newer than before and `latest_update.exit_code` is set.
- `exit_code: 0` and a higher `version` - done. `0` and the same `version` - it was already the newest. Anything else - report `exit_code`, `tail_stdout`, `tail_stderr` and `logs_path` to the operator; do not retry in a loop.

## 3. The engine's own certificate (port 2011)

`system_engine_cert_request` - the certificate the engine's API and MCP endpoint serve; project sites use **custom-domain** instead.
- `domain` - a name that already resolves to this host (default: `cert_domain`); `email` - the ACME account; `ip` - only when the detected public address is wrong
- **Every hosted site is offline for the challenge** - the webserver is stopped to free port 80, usually for seconds. Say so and ask.
- Always `dry_run: true` first: the full challenge against staging, nothing installed. Then the same call without it. Each blocks until done, up to 15 minutes.
- `422` - not issued, the served certificate is unchanged; the reason is in the message
- Success - `served_certificate.status: trusted`, and `url` / `mcp_url` move to `https://<domain>:2011`: reconnect the assistant there (`pae connect` prints the setup)
- `staging`, `force_renewal`, `skip_dns_check` - only when the user asks

## 4. How project certificates are issued

`system_ssl_config_get` - `issuer` (`self_signed` by default, or `acme`), `sites_base_domain`, `shared_zone`, `shared_zone_issuance`, `acme_directory_url`, `acme_email`.

`system_ssl_config_set` - only the fields sent change:
- `issuer: "acme"` - a certificate from an ACME authority over HTTP-01 as each domain is created; the domain must resolve to this host. Domains that exist already keep theirs - `ssl_cert_request` per domain (**custom-domain**).
- `acme_directory_url` - any RFC 8555 directory; `staging` and `live` are Let's Encrypt's; empty restores the default. `acme_email` - the contact; empty clears it.
- `sites_base_domain` - what projects without a domain are named under, `<project>.<that>`; empty clears it
- `shared_zone_issuance: true` - real certificates on zones every engine shares (panelalpha.direct, nip.io, sslip.io). Off by default: Let's Encrypt allows 50 new certificates per registered domain per week across every engine on that zone. Say that before turning it on. Domains customers own are never affected.

## 5. Outgoing mail

`system_exim_config_get` - `smarthost_provider` (empty: direct delivery; `smtp`, `sendgrid`, `mailchannels`, `amazon_ses`), hosts, ports, usernames, `sender_domain`. It also returns the stored passwords and API token: report the provider, host, port, sender domain and whether a secret is set - never a value.

`system_exim_config_set` **replaces the whole mail config**: every field not sent is cleared. It takes `smarthost_provider`, `smtp_host`, `smtp_port`, `smtp_username`, `sender_domain`, `sendgrid_api_token` - and no password field, so any call drops a stored SMTP, Mailchannels or SES password.
- Use it only for a setup with no secret: direct delivery (`smarthost_provider: ""`), or an SMTP relay that takes no login, plus `sender_domain`
- A provider with a password or token: no mail field takes a vault ref, and a secret never goes through the chat. The operator sets it with the REST API (`PUT /api/system/exim-config`, every field in one call)
- `422` - a host that is neither a hostname nor an IP, a port outside 1-65535, an IP as `sender_domain`

Test: `system_test_email_send` - `email` only. Never pass `config`: it is saved as the new mail config, exactly like a set. Report `status`: `delivered`; `deferred` (still queued, Exim retries) or `failed` (bounced), each with the Exim line in `reason`; `not_sent`; `unknown`. `exit_code: 0` alone only means Exim accepted it. Quote `reason`, not `stdout`/`stderr`.

## 6. Webserver

`system_webserver_change` - `new_webserver`. Only `nginx-proxy` is accepted today, whatever the tool lists; anything else is refused with `422`. An engine whose `webserver.slug` is already `nginx-proxy` has nothing to change - do not call it. Otherwise it runs in the background and restarts the webserver (every site blips): follow `latest_webserver_change` in `system_info` like an update.

`system_webserver_config_set` (`serial_number`, a LiteSpeed licence) and `system_webserver_password_reset` (the LiteSpeed WebAdmin password, returned once as `new_password`) work only on LiteSpeed and OpenLiteSpeed; on `nginx-proxy` they fail with `422`. Hand a new password to the operator once and never repeat it.

## 7. Extra IP addresses

Projects answer on `default_ipv4` / `default_ipv6` unless given an address of their own.
- `ip_subnet_list` - `id`, `ip`, `mask`, `is_shared`, `assigned_ips`; `meta.default_ipv4.assignments` lists the projects still on the default
- `ip_assigned_list` - `ip_address`, `username`, `domain_names`, `ip_subnet_id`
- `ip_subnet_create` - `ip` (the network address, e.g. `203.0.113.0`), `mask`, `is_shared` (one address for several projects; IPv4 only). The provider must route the range to this host - the engine does not check.
- `ip_assign` - `name`, `ip_subnet_id`, `ip_address` inside that subnet: the address goes on the host and the vhosts are rewritten. `reload_pending: true` - the webserver has not reloaded yet. The call succeeds even when the host refused the address, so verify. Then point the project's DNS at it.
- `ip_unassign` - the same arguments. `ip_subnet_delete` - `id`; refused while an address in it is assigned.

Verify on the project: `app_health_check` - `domain.verdict: ok`.

## Rules

- Read the state first, say what changes and what it costs, act only on a yes - one change at a time.
- Never take a secret in chat: none of these fields takes a vault ref. Never show mail passwords or tokens; hand `new_password` over once.
- Never start `system_update`, `system_webserver_change` or `system_engine_cert_request` again while one is running or after a client timeout - read `system_info`.
- `dry_run: true` before every real engine certificate request.
- Run **server-health** before and after; report numbers from tool output.
