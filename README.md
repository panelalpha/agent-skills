# PanelAlpha agent plugins

Plugins for AI coding agents, one per PanelAlpha product. The marketplace is `panelalpha`, and each
plugin is installed as `<plugin>@panelalpha`.

| Plugin | Product | MCP server |
|---|---|---|
| `engine` | PanelAlpha Engine, the hosting engine (MCP on port 2011) | `panelalpha-engine` |

Each plugin folder works in Claude Code, Codex, Cursor, Gemini, Grok, OpenCode,
Windsurf (Devin Desktop), Pi, Hermes and OpenClaw:

| File | Read by |
|---|---|
| `.claude-plugin/plugin.json`, `.mcp.json` | Claude Code (`${user_config.*}`) |
| `.codex-plugin/plugin.json` | Codex (`mcpServers: {}` — MCP is registered with `codex mcp add`) |
| `.cursor-plugin/plugin.json` | Cursor (pins `mcp-none.json`; MCP is the JSON from `pae connect cursor`) |
| `gemini-extension.json` | Gemini (`mcpServers: {}` — MCP is registered with `gemini mcp add`) |
| `.grok-plugin/plugin.json` | Grok (pins `mcp-none.json` so it does not load Claude's `.mcp.json`; MCP is `grok mcp add`) |
| `package.json`, `opencode.js` | OpenCode |
| `.devin-plugin/plugin.json` | Windsurf / Devin Desktop (pins `mcp-none.json`; MCP is `pae connect windsurf`) |
| `package.json` `pi` key | Pi (`pi install` loads `./skills`; MCP is `pae connect pi`) |
| `plugin.json`, `mcp.json` | Hermes (Agent Plugins v1; `mcpServers` is empty — MCP is `hermes mcp add`) |
| `openclaw.plugin.json` | OpenClaw (skills pack; `mcpServers` is empty — MCP is `openclaw mcp add`) |
| `skills/` | all of them |

Codex, Cursor, Gemini, Grok, Windsurf, Pi, Hermes and OpenClaw cannot take a per-user
URL or token on plugin install, so those manifests leave `mcpServers` empty. The
engine's `pae connect` command writes the connection into each client's own
config, including `hermes` and `openclaw`.

The marketplace files at the top are `.claude-plugin/marketplace.json` for Claude Code,
`.agents/plugins/marketplace.json` for Codex, `.cursor-plugin/marketplace.json` for Cursor
and `.grok-plugin/marketplace.json` for Grok. Gemini, Windsurf, Pi, Hermes and OpenClaw
have no marketplace file here — `gemini-extension.json`, `.devin-plugin/plugin.json`,
the `pi` key on `package.json`, `plugin.json` and `openclaw.plugin.json` sit in
`engine/` and are installed by path (or `owner/repo#engine` for Devin). `mcp.json`
is the Agent Plugins document (empty servers). Cursor, Grok and Windsurf pin
`mcp-none.json` instead, so they do not treat Claude's `.mcp.json` as their MCP config.

## engine

Skills: `create-project` (create a project, deploy an app, verify it) and `debug-project` (why a deploy
fails or a site does not answer).

### Get a token

The engine installer's last line is the Claude Code command with a token already in it. For another agent,
or a new token, run this on the engine host:

```bash
pae connect          # lists the supported agents
pae connect claude   # a fresh token plus the exact command for that agent
```

### Claude Code

```bash
claude plugin marketplace add panelalpha/agent-skills
claude plugin install engine@panelalpha \
  --config "server_url=https://<engine-host>:2011/mcp" \
  --config "api_token=<token>"
```

- Without `--config`, Claude Code asks for both values when the plugin is enabled.
- The token is stored as a secret (keychain, or `~/.claude/.credentials.json` on Linux), never in
  `settings.json`.
- To change either value, open `/plugin`, go to **Installed** and pick **engine**. `/mcp` shows the
  connection.
- The skills are `/engine:create-project` and `/engine:debug-project`. Claude also uses them on its own.
- On an engine with a self-signed certificate, start Claude Code with
  `NODE_EXTRA_CA_CERTS=/path/to/server.cert` (a copy of the engine's `crt/server.cert`), or it will not
  connect.
- To update: `claude plugin marketplace update panelalpha`, then `claude plugin update engine@panelalpha`.

### Cursor

Cursor plugin install has no `--config`. The plugin brings the skills. MCP is the JSON block
`pae connect cursor` prints — paste it in **Settings → Tools & MCP → New MCP Server**, or into
`~/.cursor/mcp.json` (all projects). It looks like this:

```json
{
  "mcpServers": {
    "panelalpha-engine": {
      "url": "https://<engine-host>:2011/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

If the file already has other servers, add `panelalpha-engine` alongside them. Putting the file
inside a project risks committing the token.

For the create/debug skills, Customize → Plugins → import `https://github.com/panelalpha/agent-skills`
and install `engine`. Reload the window. Tools & MCP should list `panelalpha-engine`.

On a self-signed engine, Cursor launched from a desktop icon will not see `NODE_EXTRA_CA_CERTS`
from your shell. Start it from a terminal where that is set, or give the engine a real certificate.

### Grok

Grok plugin install has no `--config`. The plugin brings the skills; `--trust` is required or they
stay blocked:

```bash
grok plugin marketplace add panelalpha/agent-skills
grok plugin install engine --trust
```

MCP is registered separately; `pae connect grok` prints this with the values filled in:

```bash
grok mcp add --transport http panelalpha-engine https://<engine-host>:2011/mcp \
  --header "Authorization: Bearer <token>"
```

`--transport http` is required. Check with `grok mcp list` / `grok mcp doctor`; the server name is
`panelalpha-engine`. Skills are `/engine:create-project` and `/engine:debug-project`.

To start over: `grok plugin uninstall engine --confirm` and `grok mcp remove panelalpha-engine`.
To update: `grok plugin marketplace update panelalpha`, then `grok plugin update engine`.

### Gemini

Gemini CLI extensions have no marketplace and no subfolder install — `gemini extensions install <url>`
expects `gemini-extension.json` at the root of the given source, and this repo hosts one plugin per
product folder. Clone the repo and point at `engine/` directly:

```bash
git clone https://github.com/panelalpha/agent-skills
gemini extensions install ./agent-skills/engine
```

Gemini also cannot take a per-user URL or token on install, and its MCP `headers` do not expand
environment variables (only the stdio `env` block does), so `mcpServers` in `gemini-extension.json`
stays empty. Register the server separately; `pae connect gemini` prints this with the values
filled in:

```bash
gemini mcp add --transport http --header "Authorization: Bearer <token>" panelalpha-engine https://<engine-host>:2011/mcp
```

Gemini CLI expects every option before the name and address. Default scope is the current project;
add `--scope user` with the other flags (still before the name) to keep the server for every project.
Check with `gemini mcp list`; the server name is `panelalpha-engine`. Skills are `/engine:create-project`
and `/engine:debug-project` (`gemini skills list` to confirm they loaded).

To update: `gemini extensions update engine`.

### Codex

Codex plugin install has no `--config`. The plugin brings the skills:

```bash
codex plugin marketplace add panelalpha/agent-skills
codex plugin add engine@panelalpha
```

MCP is registered separately; `pae connect codex` prints this with the values filled in:

```bash
PANELALPHA_MCP_TOKEN='<token>' codex mcp add panelalpha-engine --url https://<engine-host>:2011/mcp --bearer-token-env-var PANELALPHA_MCP_TOKEN
```

The token goes in front so Codex stores the *name* of the variable, not the token itself. Put
`export PANELALPHA_MCP_TOKEN='<token>'` in your shell profile too, or the token will not survive a
new shell. Check with `codex mcp list`; the server name is `panelalpha-engine`. Skills are
`/engine:create-project` and `/engine:debug-project`.

### Windsurf

Windsurf (Devin Desktop) has no marketplace in this repo. The plugin lives in
`engine/` as `.devin-plugin/plugin.json`. Install that folder so Devin does not
fall back to the Claude plugin and its `${user_config.*}` MCP block:

```bash
devin plugins install panelalpha/agent-skills#engine
```

A local checkout works too: `devin plugins install ./agent-skills/engine`.
`--local` keeps it on this machine only.

The plugin brings the skills. MCP is registered separately; `pae connect windsurf`
prints this with the values filled in:

```bash
devin mcp add -s user -H "Authorization: Bearer <token>" panelalpha-engine https://<engine-host>:2011/mcp
```

`-s user` stores the engine for every project. Check with `devin mcp list`; the
server name is `panelalpha-engine`. Skills are `/engine:create-project` and
`/engine:debug-project`.

On Cascade (the older Windsurf agent, no `devin` command), paste the MCP JSON
from the operator page into `~/.codeium/windsurf/mcp_config.json` (`serverUrl`,
not `url`), then load the skills by hand:

```bash
mkdir -p ~/.codeium/windsurf/skills
ln -s /path/to/agent-skills/engine/skills/create-project ~/.codeium/windsurf/skills/create-project
ln -s /path/to/agent-skills/engine/skills/debug-project ~/.codeium/windsurf/skills/debug-project
```

On a self-signed engine, start Windsurf from a terminal where `NODE_EXTRA_CA_CERTS`
points at a copy of `crt/server.cert`.

### Pi

Pi has no marketplace in this repo. `engine/package.json` declares `pi.skills`.
Clone and install that folder:

```bash
git clone https://github.com/panelalpha/agent-skills
pi install ./agent-skills/engine
```

Install the MCP adapter once if `/mcp` is not already a command, then restart Pi:

```bash
pi install npm:pi-mcp-adapter
```

The package brings the skills. MCP is the JSON block `pae connect pi` prints —
paste it into `~/.config/mcp/mcp.json` (all projects) or `.mcp.json` (this project).
It looks like this:

```json
{
  "mcpServers": {
    "panelalpha-engine": {
      "url": "https://<engine-host>:2011/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

If the file already has other servers, add `panelalpha-engine` alongside them.
Putting the file inside a project risks committing the token. Check with `/mcp`
in Pi. Skills are `/create-project` and `/debug-project`.

On a self-signed engine, add `"caFile": "~/panelalpha-engine.cert"` to that server
entry (a copy of the engine's `crt/server.cert`).

### Hermes

Hermes has no marketplace in this repo. Agent Plugins packages live at the plugin
folder root, so clone the repo and point at `engine/`:

```bash
git clone https://github.com/panelalpha/agent-skills
hermes plugins install ./agent-skills/engine --enable
```

Portable packages stay disabled until `--enable`. The plugin brings the skills.
MCP is registered separately; `pae connect hermes` prints YAML for
`~/.hermes/config.yaml`. Hermes has no `--config` on plugin install and Agent
Plugins `mcp.json` must not contain credentials. The CLI equivalent is:

```bash
hermes mcp add panelalpha-engine --url https://<engine-host>:2011/mcp --auth header
```

It asks whether the server needs authentication (yes) and whether to enable every
tool. Put the token in `~/.hermes/.env` as `MCP_PANELALPHA_ENGINE_API_KEY` if you
want to skip typing it. Check with `hermes mcp test panelalpha-engine`; the server
name is `panelalpha-engine`. Skills are `/create-project` and `/debug-project`
(`hermes skills` to confirm they loaded).

The MCP URL must match the certificate on the engine. A Let's Encrypt certificate
for the bare IP will fail TLS if you use a hostname that is not on that certificate.

### OpenClaw

OpenClaw has no marketplace in this repo. The native manifest is
`openclaw.plugin.json` in `engine/`. Clone and install that folder so OpenClaw
does not pick a Claude or Codex bundle instead:

```bash
git clone https://github.com/panelalpha/agent-skills
openclaw plugins install ./agent-skills/engine
```

The plugin brings the skills. MCP is registered separately; `pae connect openclaw`
prints this. The manifest leaves `mcpServers` empty so it does not ship a token:

```bash
openclaw mcp add panelalpha-engine \
  --url https://<engine-host>:2011/mcp \
  --transport streamable-http \
  --header "Authorization: Bearer <token>"
```

`--transport streamable-http` is required. Check with `openclaw mcp doctor panelalpha-engine --probe`;
the server name is `panelalpha-engine`. Skills are `/create-project` and `/debug-project`.

### OpenCode

The npm package `opencode-panelalpha-engine` is not published yet. Point `opencode.json` at a checkout:

```json
{
  "plugin": [
    ["file:///path/to/agent-skills/engine/opencode.js",
     { "url": "https://<engine-host>:2011/mcp", "token": "{env:PANELALPHA_MCP_TOKEN}" }]
  ]
}
```

`PANELALPHA_MCP_URL` and `PANELALPHA_MCP_TOKEN` in the environment work instead of the options. The
plugin registers the `panelalpha-engine` MCP server and the skills; a `panelalpha-engine` server
already in `opencode.json` wins over it. Check with `opencode mcp list` and `opencode debug skill`.
The same `package.json` is the Pi skills package (`pi` key + `pi-package` keyword).

## Adding a plugin for another product

Put it next to `engine/`, for example `panel/`, and keep it separate from `engine/` everywhere:

- Its own plugin name, used as the folder name and in every marketplace file.
- Its own MCP server name, such as `panelalpha-panel`.
- Its own `userConfig` (Claude). Cursor, Codex, Gemini, Grok, Windsurf, Pi, Hermes and
  OpenClaw leave `mcpServers` empty and take URL and token from `pae connect` or
  that client's `mcp add`.
- Skill descriptions that name the product, so an agent does not pick an engine skill for a panel task.

Then add an entry for it to every marketplace file (Claude, Codex, Cursor, Grok), and give it its own
`gemini-extension.json`, `.devin-plugin/plugin.json`, `pi` key on `package.json`, Agent Plugins
`plugin.json` / `mcp.json`, and `openclaw.plugin.json` — those clients have no marketplace file,
so each product's plugin folder needs them.

## Notes

- The engine decides what a token may do: `MCP_PERMISSION_MODE`, `MCP_TOOLSETS` and `MCP_DENIED_TOOLS`
  in `.env-core` set which tools a client sees.
- A plugin's URL and token are set once per machine, so one install talks to one engine. For more
  engines, add them as plain MCP servers per project (`claude mcp add --scope local …`).
