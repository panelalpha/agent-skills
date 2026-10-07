---
name: server-health
description: Read-only health report for a PanelAlpha Engine server (the hosting engine, MCP on port 2011) - failed or unhealthy projects, CPU/RAM/disk pressure, certificates close to expiry, projects near their limits, firewall and backup status. Use when asked how the server is doing, for a status or morning check, what is broken, whether anything needs attention, or before a maintenance window on a PanelAlpha Engine.
---

# Server health on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every project tool takes the project as `name`; domain tools (`ssl_cert_get`) also take `domain`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

**This skill only reads.** It changes nothing - no rebuild, restart, limit change or firewall change. It ends with a report and, per finding, the skill that fixes it. Ask before acting on any of it.

## 1. The server

- `system_info` - `version`; `served_certificate` (the engine's own certificate on port 2011: `status`, `days_remaining` - `self_signed` is expected on a host with a private IP and no domain, not a finding); `sites_certificates` (`issuer`, and `shared_zone` + `shared_zone_issuance` - false means projects on the shared zone keep self-signed certificates, by the operator's choice); `webserver.slug`
- `metrics_current` - `cpu_usage_percent`, `ram_usage_percent`, `disk_usage_percent`. This is the only metrics call that reports how full the disk is, and the one to quote for CPU. Units differ: `disk_*` are bytes, `ram_*` are **KiB** (`ram_total: 8131792` is 7.8 GiB).
- `metrics_last_hour_averages` - `avg_cpu_percent`, `avg_ram_percent`: a spike in `metrics_current` that the hour does not show is a moment, not a trend
- `metrics_latest` - load average (`cpu_load_avg` 1m/5m/15m), `swap_percent`, disk and network I/O. Its answer is a bare object, not wrapped in `data`, and its `cpu_percent` is an instant sample - quote CPU from `metrics_current`
- `firewall_status` - `provider` (`ufw`), `enabled`, `default_incoming`, `error`. `enabled: null`, a set `error` or a failed call means the firewall state is unknown - say so, do not guess
- `backup_container_list` - an empty list means no project on this server can be backed up

Thresholds worth reporting: disk above 85%, RAM above 90% or any sustained swap, a certificate with under 14 days. No tool reports the core count, so give the load average as numbers without judging it.

## 2. The projects

`project_list_summary` - every project with `name`, `status` and `domain_count` in one call (a bare object, not wrapped in `data`). Then, per project:

- `project_get` - `details.deployment_status` (`success`, `partial`, `failed`), `details.health_healthy`, `details.deployment_warnings`, `details.health_failed_checks`; `details.domain.publicly_resolvable: false` means the site answers on the local network only, and `details.domain.fallback_reason` says why.
  **While a deploy runs, those status keys are absent**, not `running`. Check `deploy_log_get` (`offset: 100000`): `status` `running` means report "deploy in progress" and move on - do not wait for it.
- `details.ssl` (same `project_get` call) - `status`, `days_remaining` for the main domain. `ssl_cert_list` covers every domain but returns each certificate in full PEM (~5 KB a domain): use it only for projects whose `domain_count` is above 1. On a `*.panelalpha.online` name (`details.domain.tls_terminated_at: proxy`) visitors see the proxy's certificate, so the engine's own one is not a finding there.
- `project_usage` - `storage.usage` (MB) against `storage.maximum` (`-1` is unlimited), this month's `bandwidth.usage` (bytes) against `bandwidth.maximum` (`null` is unlimited), and the counts of domains, FTP/SFTP accounts and databases. It has no memory figure. If it fails, note "usage unavailable" and go on.
- `backup_list` - only when `backup_container_list` was not empty: the newest backup and whether it completed

Only on request, or for a project that is already a finding:
- `app_health_check` - probes the app's ports; it costs seconds and touches the container
- `container_list` - a service `restarting` is a crash loop

Many projects: read `project_list_summary` whole, then go project by project and keep only the findings - do not dump every record.

`suspended` in `status` is an operator decision, not a fault. List it, do not flag it.

## 3. Report

Lead with what needs attention, most urgent first, then one line per healthy area. For each finding: the project (or "server"), the number that crossed the line, and the next step:

| finding | next step |
|---|---|
| deploy `failed`, `health_healthy: false`, a restarting service | **debug-project** |
| deploy `partial` whose only warnings are the private address and the self-signed certificate | not a fault: the site works on the local network. One line, not a finding |
| `publicly_resolvable: false` | the operator: point a domain they control at a public address of this host |
| certificate close to expiry, domain not serving | `ssl_cert_get` (`name`, `domain`), then `ssl_cert_request` (`dry_run: true` first) once the name resolves here - ask first. Deploy warnings name the host command `ssl:project-cert:request`; over MCP it is `ssl_cert_request` |
| project near its storage or bandwidth limit | `project_update` - ask first |
| server disk/RAM pressure | the operator: which projects use the most (`project_usage`), and whether to raise, clean up or move |
| no backup container, or no recent backup of a project that holds data | the operator: `backup_container_create`, then `backup_create` per project |

Say what you did not check (e.g. "`app_health_check` skipped for 40 healthy projects") so a clean report is not read as more than it is.

## Rules

- Read only. Never rebuild, restart, suspend, change limits, or touch the firewall or ModSecurity from this skill.
- Report numbers from the tool output, with units, never "looks fine".
- Never show `.env` values or credentials.
