---
name: server-health
description: Read-only health report for a PanelAlpha Engine server (the hosting engine, MCP on port 2011) - failed or unhealthy projects, CPU/RAM/disk pressure, certificates close to expiry, projects near their limits, firewall and backup status. Use when asked how the server is doing, for a status or morning check, what is broken, whether anything needs attention, or before a maintenance window on a PanelAlpha Engine.
---

# Server health on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every project tool takes the project as `name`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

**This skill only reads.** It changes nothing - no rebuild, restart, limit change or firewall change. It ends with a report and, per finding, the skill that fixes it. Ask before acting on any of it.

## 1. The server

- `system_info` - `version`; `served_certificate` (the engine's own certificate on port 2011: `status`, `days_remaining`); `sites_certificates` (`issuer`, and `shared_zone` + `shared_zone_issuance` - false means projects on the shared zone keep self-signed certificates, by the operator's choice); `webserver.slug`
- `metrics_current` - `cpu_usage_percent`, `ram_usage_percent`, `disk_usage_percent` and the byte totals behind them. This is the only metrics call that reports how full the disk is.
- `metrics_last_hour_averages` - `avg_cpu_percent`, `avg_ram_percent`: a spike in `metrics_current` that the hour does not show is a moment, not a trend
- `metrics_latest` - load average (`cpu_load_avg` 1m/5m/15m), swap, disk and network I/O
- `csf_status` - `enabled`, `version`, `error`. A set `error` or a failed call means the firewall state is unknown - say so, do not guess
- `backup_container_list` - an empty list means no project on this server can be backed up

Thresholds worth reporting: disk above 85%, RAM above 90% or any sustained swap, 15-minute load above the core count, a certificate with under 14 days.

## 2. The projects

`project_list_summary` - every project with `name` and `status` in one call. Then, per project:

- `project_get` - `details.deployment_status` (`success`, `partial`, `failed`, `running`), `health_healthy`, `details.deployment_warnings`; `details.domain.publicly_resolvable: false` means the site answers on the local network only, and `fallback_reason` says why
- `details.ssl` (same `project_get` call) - `status`, `days_remaining` for the main domain. `ssl_cert_list` covers every domain but returns each certificate in full PEM (~5 KB a domain): use it only for projects with add-on domains. On a `*.panelalpha.online` name (`details.domain.tls_terminated_at: proxy`) visitors see the proxy's certificate, so the engine's own one is not a finding there.
- `project_usage` - disk, memory and this month's `bandwidth.usage` against `bandwidth.maximum` (null means unlimited). It can answer `500` on a DinD project (a known engine defect); note "usage unavailable" and go on.
- `backup_list` - when backup containers exist: the newest backup and whether it completed

Only on request, or for a project that is already a finding:
- `app_health_check` - probes the app's ports; it costs seconds and touches the container
- `container_list` - a service `restarting` is a crash loop

Many projects: read `project_list_summary` whole, then go project by project and keep only the findings - do not dump every record.

`suspended` in `status` is an operator decision, not a fault. List it, do not flag it.

## 3. Report

Lead with what needs attention, most urgent first, then one line per healthy area. For each finding: the project (or "server"), the number that crossed the line, and the next step:

| finding | next step |
|---|---|
| deploy `failed` / `partial`, `health_healthy: false`, a restarting service | **debug-project** |
| certificate close to expiry, domain not serving | `ssl_cert_get`, then `ssl_cert_request` (`dry_run: true` first) once the name resolves here - ask first |
| project near its disk or memory limit | `project_update` - ask first |
| server disk/RAM pressure | the operator: which projects use the most (`project_usage`), and whether to raise, clean up or move |
| no backup container, or no recent backup of a project that holds data | the operator: `backup_container_create`, then `backup_create` per project |

Say what you did not check (e.g. "`app_health_check` skipped for 40 healthy projects") so a clean report is not read as more than it is.

## Rules

- Read only. Never rebuild, restart, suspend, change limits, or touch CSF/ModSecurity from this skill.
- Report numbers from the tool output, with units, never "looks fine".
- Never show `.env` values, credentials or `csf_ui_credentials`.
