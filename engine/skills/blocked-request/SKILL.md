---
name: blocked-request
description: Triage a blocked request on a PanelAlpha Engine (the hosting engine, MCP on port 2011) - a form, upload or API call answered 403, an address locked out, a port that does not answer. Finds the ModSecurity rule that fired and excludes it narrowly, then checks the ufw firewall and fail2ban bans. Use when a site or the engine refuses, blocks or drops requests on a PanelAlpha Engine.
---

# Blocked requests on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every project tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

With tool search on, none of these tools is listed up front: find them with `search_tools`, run them with `execute_tools`. One that cannot be found is withheld on this engine - deletes under a "change but not delete" ceiling, every change under "look only". The operator offers it with `pae configure mcp-tokens` (`pae mcp:tool:list` shows what is offered), then reconnects the assistant.

## 1. Which layer refused it

Ask for the URL, the method, the client's public address and roughly when. Then:

| the client sees | layer | go to |
|---|---|---|
| 403, and an audit entry for that host and path at that time | ModSecurity | step 2 |
| 403, no audit entry, or ModSecurity `mode` is `off` | the app itself | **debug-project** - `container_service_logs` |
| no answer at all on every port, from one address | a fail2ban ban | step 6 |
| no answer on one port, from everywhere | a firewall rule or the default policy | step 5 |
| the site works, its second port (admin UI, websocket) does not | routing, not the firewall | **debug-project** step 4 |

## 2. ModSecurity: the state

- `modsec_mode_get` - `mode` (`on`, `off`, `detection_only`) and `enabled_rulesets`. The mode is **one setting for every site** on the server; there is no per-domain switch. `off` cannot cause a 403; `detection_only` logs and never blocks.
- `modsec_ruleset_list` - `name`, `enabled`, `config_files` for `owasp-crs`, `panelalpha-wordpress` and `custom`.

## 3. ModSecurity: find the rule

1. Reproduce the request (or ask the user to), then right away:
2. `modsec_audit_log_list` - `file`, `mtime`, `size`. The live file is `audit.log`; older ones are rotated and compressed.
3. `modsec_audit_log_tail` - `filename: "audit.log"` - the JSON entries in the file's last 50 KB, newest first. Match `transaction.request.headers.Host`, `transaction.request.uri`, `transaction.request.method`, `transaction.client_ip` and `transaction.time_stamp`; `transaction.response.http_code` is what the client got.
4. `transaction.messages[]` - each a `message` and `details.ruleId`, `details.data`, `details.match`. With the OWASP CRS, `949110` "Inbound Anomaly Score Exceeded" is the rule that blocks; the others listed with it scored the request. Exclude those ids, not 949110. Ids from 1000000 are the engine's own (e.g. WordPress hardening).

Entries carry the request headers: quote only the fields above, never cookies or authorization. `modsec_audit_log_download` returns only the first ~48 KB of a file - not where a recent request is.

## 4. ModSecurity: the narrowest fix

Say what the change covers, ask, then take the first option that works:

1. **Exclude the rule for one path.** `modsec_custom_rules_get` - `rules`, `enabled` (the `custom` ruleset is on), `id_range` (1100000-1199999). `modsec_custom_rules_set` - `rules` is the **whole file**: append to what `get` returned, never send only the new line.
   ```
   SecRule REQUEST_URI "@beginsWith /wp-admin/admin-ajax.php" "id:1100001,phase:1,pass,nolog,ctl:ruleRemoveById=942100"
   ```
   One path on one site - a chain, each line its own `SecRule`:
   ```
   SecRule REQUEST_HEADERS:Host "@streq shop.example.com" "id:1100002,phase:1,pass,nolog,chain"
   SecRule REQUEST_URI "@beginsWith /upload" "ctl:ruleRemoveById=942100"
   ```
   One field only (a rich-text body): `ctl:ruleRemoveTargetById=942100;ARGS:message`. A new id per rule, inside `id_range`. The webserver tests the rules before they go live: a `422` says what it refused, and the live rules stay as they were. `SecRuleEngine`, `ctl:ruleEngine` and `skip` are always refused. The rules apply only once `custom` is enabled: `modsec_ruleset_enable` - `name: "custom"` if `enabled` was false.
2. **One rule file off, for every site:** `modsec_ruleset_configs_set` - `name: "owasp-crs"`, `disable: ["REQUEST-942-APPLICATION-ATTACK-SQLI.conf"]` (names as `config_files` lists them; `enable` puts one back).
3. **A whole ruleset off:** `modsec_ruleset_disable` - `name`.
4. **Mode:** `modsec_mode_set` - `detection_only` stops blocking on every site and keeps logging; `off` stops both. Only on an explicit yes to exactly that, and offer to set `on` again afterwards.

Verify: repeat the request - it passes, and no new audit entry names that rule id. Still blocked by the same id: report it; do not widen the fix without asking.

## 5. Firewall: a port that does not answer

- `firewall_status` - `provider` (`ufw`), `enabled`, `default_incoming`, `error`. `enabled: null` or an `error` means the state is unknown - say so.
- `firewall_rule_list` - in the order they are evaluated. `scope: "host"` (default, the host's own ports) or `scope: "published"` (ports Docker publishes, by the container's port). Each: `id`, `action`, `direction`, `protocol`, `port`, `source`, `destination`, `comment`, `managed`, `editable`. A deny is placed above every allow and wins.
- `firewall_log_list` - `type: "blocked"`, `address`, `limit` - connections the default policy dropped, newest first. A drop by an explicit deny rule is **not** logged: look for the deny in the rule list.

Fix, after asking:
- `firewall_rule_create` - `action: "allow"`, `port`, `protocol`, and `source` set to the address or CIDR that needs it, unless the port is meant to be public. `scope` must match the port: a host rule does not reach a published port, nor the other way round. A rule matching the same traffic as an existing one is refused naming that rule - edit that one instead. Never open a port for a site: sites are reached through the engine's webserver.
- `firewall_rule_update` - `id` and only the fields to change (`null` clears one); the rule gets a new `id` when what it matches changes.
- `firewall_rule_delete` - `id`. `firewall_reload` - when a change does not seem to apply.

`managed: true` rules are the ports the engine needs (SSH, HTTP, HTTPS, 2011, FTP, SFTP): never remove or edit them - the engine refuses with `422`. `editable: false` rules were written on the host with options the API does not carry: the operator changes them there.

## 6. Bans and lockouts (fail2ban)

fail2ban bans an address after repeated failed logins on SSH, SFTP, FTP or the engine API (5 in 10 minutes, 10 for the API). A ban starts at an hour, grows to a week for a repeat offender, and closes every port to that address.
- `firewall_log_list` - `type: "ban"` (or `unban`), `address` - `jail` says which login kept failing
- in `firewall_rule_list` a ban is a `deny` from that `source`, `scope: "both"`, `comment` starting `by Fail2Ban`
- `firewall_trusted_add` - `address`, `comment` (e.g. `office`): lifts the ban, and the address is never banned again - its failed logins are not counted at all. Only for an address the user controls: their office, monitoring, the panel that calls this engine.
- one-off: `firewall_rule_delete` on the ban rule lifts it in fail2ban too; the address can be banned again
- `firewall_trusted_list`, `firewall_trusted_delete` - `id`. Trusted is not an allow rule: firewall rules still apply to it.

Then find why the logins failed (a wrong password, a stale token in a client), or the ban comes back. If the banned address is the one this assistant connects from, its calls time out: the operator lifts it from another address, or with `fail2ban-client unban <address>` on the host.

## 7. Last resort: the firewall off

`firewall_disable` opens every port on the host. Only on an explicit yes, for the shortest time, then `firewall_enable` and `firewall_status`. Both answer `502` with the reason when ufw refuses.

## Rules

- Ask before every change: custom rules, a ruleset, the mode, any firewall rule, trusting an address, enabling or disabling.
- Narrowest first: one rule id on one path, one port for one address. `modsec_mode_set` to `off`/`detection_only` and `firewall_disable` need the user's explicit yes to that step.
- Never remove or edit a `managed` rule.
- `modsec_custom_rules_set` replaces the whole file: always build on `modsec_custom_rules_get`.
- Never quote cookies, tokens or authorization headers from the audit log.
- Report the evidence: the audit entry (host, uri, rule ids), the log line, or the rule that matched.
