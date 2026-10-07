---
name: custom-domain
description: Put a user's own domain on a project on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - make it the project's address or add it beside the current one, tell the user which DNS records to set, get a trusted certificate (Let's Encrypt or their own), or reach the app through a Cloudflare tunnel when DNS cannot point at the host; also rename or remove a domain. Use when asked to connect, add, move or remove a domain, set up DNS, HTTPS/SSL or a Cloudflare tunnel for a PanelAlpha Engine project.
---

# Custom domain on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

## 1. Look first

- `project_get` - `domain` is the main domain. `details.template: dind` or a `details.git_repo` is a **container app**; anything else is classic PHP hosting
- `domain_list` - every domain with `type` (`main`, `addon`, `sub`), `details.aliases`, `details.document_root`
- `domain_find` - `domain`: a 200 means the name is already on this engine and cannot be added again

Ask the user: should the domain **replace** the current address (step 2) or sit **beside** it (step 3)?

## 2. Make it the main domain

`project_update` - `name`, `domain: "shop.example.com"`. Ask first and say what it does:
- the old name stops answering at once; its routes, settings and aliases move to the new name. A `www.` alias follows only if the old name had one
- tunnels on the old name are removed - a `*.panelalpha.online` name is released and may be taken by someone else
- `422` `problems[].code: domain_taken` - the name, or its `www.`, is already on this engine

Container app: then `project_rebuild`. The app gets its public URL (`APP_URL` and the like) from the main domain at deploy time and links to the old name until then.
After a rename, `project_get` `details.domain` (`source`, `tls_terminated_at`) still describes the name the project was created with: read the certificate with `ssl_cert_get`, not from there.

## 3. Add it beside the main domain

`domain_create` - `domain`, `type`: `addon` for a name of its own, `sub` for a subdomain with `parent_domain` (one of the project's domains; the name must end with it). The tool's description says `subdomain` - the engine refuses that, send `sub`. `www.example.com` is created as `example.com` with the `www.` as an alias; `aliases` adds more.
- `422` with `error_type` `addon_domains_limit_reached` / `subdomains_limit_reached` - the project's limit (`project_update` `addon_domains_limit` / `subdomains_limit`, ask first); "Domain already exists." - on this engine already
- **Container app:** a new domain serves a placeholder page, not the app - no route points it there. Add two `proxy_rule_create` (ask first): `name`, `transport: "http"`, `listen_port` `80` and `443`, `server_name: <domain>`, with `upstream_host`, `upstream_port` and `upstream_protocol` copied from the main domain's rules in `proxy_rule_list`. A redeploy that moves the app to another port updates only the main domain's rules: re-check these and fix with `proxy_rule_update`
- **Classic PHP:** the domain serves its own `details.document_root`

Just another name for the same site? An alias is simpler: `domain_update` - `name`, `domain` (the main one), `aliases`. The list replaces the old one (keep `www.`), and an empty list changes nothing.

## 4. DNS records for the user

- Web: an `A` record for the name and its `www.` → `system_info` `default_ipv4`; `AAAA` → `default_ipv6` when set. With `ipv4_nat_mode: true` give the `public_ip` from `ipv4_nat_maps`. A project with an address of its own (`ip_assigned_list`) answers on that one
- Mail, only if the app sends mail as this domain: `domain_mail_dns_get` - `name`, `domain` → `relay` (`direct` = mail leaves from this host) and `records[]`: `type` (`spf`, `dkim`, `dmarc`, `mx`), `host`, `record_type`, `expected`, `note`. Pass them on as listed; where `expected` is null the `note` says what to do. `dkim_selector` names the relay's DKIM selector
- After the user changes DNS: `domain_mail_dns_get` with `check: true` - each record gets `status` `ok` / `missing` / `wrong` / `unknown`, with `found` and `problem`

No tool resolves a web record: check with your own resolver (`dig +short A <domain>`) that it returns the address you gave. Propagation takes minutes to hours - wait for it before step 5.

## 5. Certificate

- `ssl_cert_get` - `name`, `domain` → `status` (`trusted`, `self_signed`, `domain_mismatch`, `expired`, ...), `days_remaining`, `domains`. Adding or renaming a domain already tries Let's Encrypt when `system_info` `sites_certificates.issuer` is `acme`, and falls back to self-signed when the name did not resolve yet
- `ssl_cert_request` - `name`, `domain`, `dry_run: true` first: `ineligible_reason: null` means an authority may issue for the name (a shared zone is refused). It does **not** test DNS - that is step 4
- then without `dry_run`: HTTP-01, no downtime, answers when done with `status`, `issuer`, `expires_at`, `days_remaining`. A `422` "Could not obtain a certificate for ..." carries the authority's reason (e.g. `DNS problem: NXDOMAIN`). Let's Encrypt allows 5 failed tries per name per hour: fix DNS before retrying; `staging: true` rehearses without spending them
- the certificate names the domain only, not its aliases: `https://www.` shows a mismatch unless the user installs one covering both
- renewal is automatic for certificates the engine issued; not for installed ones
- **The user's own certificate:** `ssl_cert_install` - `cert`, `key`, `ca` (PEM). `key` takes the private key itself - a `vault:` ref is not resolved there, so over MCP the key would pass through this conversation. Never ask for it in chat: offer Let's Encrypt, or let the user send it themselves to `PUT /api/projects/<name>/domains/<domain>/install-ssl-cert` with their own API token. They renew it themselves
- once `trusted`: offer `domain_update` `force_https_redirect: true`

## 6. DNS cannot point here: Cloudflare tunnel

For a zone on Cloudflare when the host has no reachable public address. Container apps only.
1. `vault_secret_create` - `type: "cloudflare_api_token"`, `purpose`, `verify_with: {"hostname": "shop.example.com"}` → give the user the `url`; the form lists the two permissions (Account → Cloudflare Tunnel → Edit, Zone → DNS → Edit) and checks the token before saving. `vault_secret_status` until `filled`
2. `project_setting_set` - `name`, `key: "cloudflare-api-token"`, `value: "vault:<id>"` → `data.account_name`: confirm it is the user's account. `422` on `value` - Cloudflare refused the token
3. `tunnel_create` - `name`, `domain`: the project's main domain (it holds the app's routes), `hostname: "shop.example.com"`, `provider: "cloudflare"` → `201` with `url`. The engine creates the tunnel, runs its connector in the project and writes the CNAME. The hostname must not be a domain or alias on this engine - do not also `domain_create` it. TLS is Cloudflare's: no `ssl_cert_request`
4. `tunnel_list` - `name`, `domain`; fetch the `url`

Remove: `tunnel_delete` - `name`, `domain`, `hostname`; its DNS record and route go. `project_setting_delete` of the token is refused while Cloudflare tunnels exist (`force: true` tears them all down - ask first).

## 7. Remove a domain

`domain_delete` - `name`, `domain` (the exact name, not an alias). Ask first. It removes the vhost, the routes and tunnels of that name. `422` while it has subdomains - delete those first.
**Never delete the `main` domain**: the engine does not stop you and the site loses its routes. Rename it with `project_update` instead. To drop an alias, `domain_update` `aliases` with the ones to keep.

## 8. Verify and report

- `domain_get` - `name`, `domain`: `type`, `details.aliases`
- `app_health_check` - `domain.verdict: ok` for the main domain (asks the webserver directly, not DNS)
- `ssl_cert_get` - `status: trusted`, `covers_domain: true`
- fetch `https://<domain>/` - the app itself, not the placeholder page

Report the URL, the DNS records handed over, the certificate `status` and `expires_at`, and what the user still has to do.

## Rules

- Ask before `project_update` `domain`, `domain_delete`, `tunnel_delete`, `proxy_rule_create` or `ssl_cert_install`.
- Never ask for a token or private key in chat and never repeat one: the Cloudflare token goes through the vault.
- Never request a certificate before DNS resolves here, and never retry a failed request in a loop.
- `acme_challenge_*` serve challenges for a certificate client run elsewhere; `ssl_cert_request` publishes its own.
