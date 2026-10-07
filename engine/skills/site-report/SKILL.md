---
name: site-report
description: Read-only report on how a site on a PanelAlpha Engine (the hosting engine, MCP on port 2011) is doing - visitors, top pages, referrers, countries and status codes, bandwidth against the project's limit, disk usage, and page speed from a Lighthouse run. Use when asked how a site or project is doing, how many visitors it has, where its traffic comes from, how much bandwidth or disk it uses, or how fast it is on a PanelAlpha Engine.
---

# Site report on PanelAlpha Engine

Tools come from the PanelAlpha Engine MCP server, `panelalpha-engine`. Use only its tools, not another PanelAlpha server's. Every project tool takes the project as `name`; the domain tools also take `domain`.

Not connected? Run `pae connect` on the engine host - it prints the setup for each agent.

**This skill only reads.** It changes nothing - no limit change, rebuild or cache flush. It ends with a report and, per finding, the skill that acts on it. Ask before acting on any of it.

## 1. The project and its domains

- `project_get` - `status`, `details.deployment_status`, `details.health_healthy`; the limits `details.memory_limit` (MB) and `details.cpu_limit` (CPUs, `null` is none). A project that is `failed` or unhealthy: report that first, the rest is secondary
- `domain_list` - every domain of the project. The visitor and bandwidth tools take one of these names; an alias or another project's domain answers `404`

## 2. Pick the period

Every statistics call needs `start` and `end` as `YYYY-MM-DD`, `end` not before `start`. There are no aliases: work out "last week" or "this month" yourself. Default: the 1st of this month to today, plus last month for comparison.

**How fresh it is:** the numbers come from the web server's access logs, read into AWStats **once a day**. Today's traffic is not in yet - the last day in `visits.records` says how far the data goes. Missing data comes back as zeros or `{}`, not an error: a domain added today, or one with no traffic yet, looks the same. Say which it is likely to be, not "no visitors".

## 3. Visitors

`domain_visitors` - `start`, `end`:
- `total` - hits in the range; `visits.total` - visits in the range; `visits.records` - visits per day
- `unique` - unique visitors for the **whole calendar months** the range touches, not for the range. Say so when the range is not whole months
- `visits_length` - visits by session length, e.g. `0s-30s`, for the same whole months

`domain_visitors_breakdown` - `dimension`, `start`, `end` → rows of `label`, `visits` (and `code`, `bytes` for status codes):
- `pages` - views per page; `referrers` - where visitors came from; `browsers`, `os`
- `countries`, `continents`, `regions` - empty until the operator runs `pae geolocation:database update` on the host. Empty geo is not "no visitors from anywhere"
- `status_codes` - hits and `bytes` per HTTP status in the range. `200` and `304` share one `200/304` row. A large `404`, `403` or `5xx` share is a finding
- every dimension but `status_codes` counts the whole calendar months, not the day range

Report the top 5-10 rows per dimension, not the whole list.

## 4. Bandwidth

- `project_usage` - `bandwidth.usage`: this calendar month's transfer in **bytes**, host timezone, against `bandwidth.maximum` (bytes, `null` is unlimited). The engine does not stop or slow a site that passes it: it is a figure to report
- `project_bandwidth` - `start`, `end`, `group_by` (`day` or `month`) → bytes keyed by date (the 1st of the month for `month`); the sum of the project's domains
- `domain_bandwidth` - the same per domain: which domain carries the traffic

Transfer counts every response, robots and crawlers included, so it is higher than the visitor numbers suggest. Give bytes as MB or GB (1 GB = 1024³ bytes) and the share of the limit in percent.

## 5. Disk

`project_usage`:
- `storage.usage` against `storage.maximum` - both **MB**, `-1` is unlimited. It counts the project's files, not the Docker data of a project running in its own containers (images, build cache, named volumes - where a bundled database keeps its data)
- `logs.usage` - **bytes** the project's container logs take; not part of `storage.usage`. `0` for a project without containers of its own
- `mysql_databases`, `addon_domains`, `subdomains`, `ftp_accounts`, `sftp_accounts` - each `usage` against `maximum`

## 6. Speed

`lighthouse_report_create` runs Lighthouse's **performance** category on the engine and answers only when the run has finished - there is no task to poll. One URL and form factor per call: run the main page, and more only if the user asks.
- `url` - `https://` plus one of this engine's domains. An IP address or a domain hosted elsewhere is refused (`422`)
- `desktop_preset: true` for desktop; mobile without it. Say which one the score is
- `no_local_resolve` - left out, Chrome reaches the domain at this server's own address, so the score is the server and the page, not the visitor's network. `true` resolves it through public DNS, as a visitor would (through the proxy for a `*.panelalpha.online` name)
- `summary` is on by default: `categories.performance.score` (0-1, report it as 0-100), `formFactor`, `fetchTime`, `runtimeError`, `runWarnings`, and per audit `title`, `score`, `displayValue`, `numericValue`. Quote `largest-contentful-paint`, `total-blocking-time`, `cumulative-layout-shift`, `server-response-time`, and the worst-scoring audits
- `422` "lighthouse service is disabled" or a `502` with Lighthouse's message - the operator has it off or it is not running: say speed was not measured. `422` "redirected to ..." - the page left this engine's domains; the report is withheld

## 7. Container resources

No tool reports a single project's own CPU or memory use - only its limits (step 1). Server-wide use is **server-health**. `container_list` says whether each service is `running` or `restarting`; a restarting one is a finding for **debug-project**.

## 8. Report

Per domain and period: visitors, top pages and referrers, the status-code mix, bandwidth against the limit, disk against the limit, the performance score with the form factor. Every number with its unit and period, and what it does not cover (today's traffic, unique visitors being whole months, Docker data outside `storage.usage`). Then the findings:

| finding | next step |
|---|---|
| project `failed` / unhealthy, a `restarting` service, many `5xx` | **debug-project** |
| many `403` | **blocked-request** |
| many `404` after a domain or address change | **custom-domain** |
| bandwidth or disk above 80% of the limit | the operator: raise it with `project_update` (`bandwidth_limit`, `disk_space_limit`, both MB) - ask first |
| poor score on a PHP app, slow `server-response-time` | **php-tuning**; a WordPress site: plugin review in **app-admin** |
| the server itself under pressure | **server-health** |
| geo dimensions empty | the operator: `pae geolocation:database update` on the host |

## Rules

- Read only. Never change limits, rebuild, restart or flush caches from this skill.
- Report numbers from the tool output with units and the period, never "looks fine"; name what the data does not cover.
- Never show `.env` values, credentials or one-click login links in a report.
