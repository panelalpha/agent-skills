# PanelAlpha agent plugins

Plugins for AI coding agents, one per PanelAlpha product. The marketplace is `panelalpha`, and each
plugin is installed as `<plugin>@panelalpha`.

| Plugin | Product | MCP server |
|---|---|---|
| `engine` | PanelAlpha Engine, the hosting engine (MCP on port 2011) | `panelalpha-engine` |

Each plugin folder works in Claude Code, Codex, Cursor, Gemini, Grok and OpenCode:

| File | Read by |
|---|---|
| `.claude-plugin/plugin.json`, `.mcp.json` | Claude Code (`${user_config.*}`) |
| `.codex-plugin/plugin.json` | Codex (`mcpServers: {}` — MCP is registered with `codex mcp add`) |
| `.cursor-plugin/plugin.json`, `mcp.json` | Cursor (optional variables; `cursor --add-mcp` is the usual config) |
| `gemini-extension.json` | Gemini (`mcpServers: {}` — MCP is registered with `gemini mcp add`) |
| `.grok-plugin/plugin.json` | Grok (pins `mcp-none.json` so it does not load Claude's `.mcp.json`; MCP is `grok mcp add`) |
| `package.json`, `opencode.js` | OpenCode |
| `skills/` | all of them |

Codex, Gemini and Grok cannot take a per-user URL or token on plugin install, so those
manifests leave `mcpServers` empty. The engine's `pae mcp:connect` command writes
the connection into each client's own config instead.

The marketplace files at the top are `.claude-plugin/marketplace.json` for Claude Code,
`.agents/plugins/marketplace.json` for Codex, `.cursor-plugin/marketplace.json` for Cursor
and `.grok-plugin/marketplace.json` for Grok. Gemini has no marketplace file — `gemini-extension.json`
sits directly in `engine/` (like OpenCode's `opencode.js`) and is installed by path, not by URL.

## engine

Skills: `create-project` (create a project, deploy an app, verify it) and `debug-project` (why a deploy
fails or a site does not answer).

### Get a token

The engine installer's last line is the Claude Code command with a token already in it. For another agent,
or a new token, run this on the engine host:

```bash
pae mcp:connect          # lists the supported agents
pae mcp:connect:claude   # a fresh token plus the exact command for that agent
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

Cursor has no `plugin install --config`. The durable stand-in is `cursor --add-mcp`, which writes
the URL and token into the user MCP profile (same as Settings → Tools & MCP). That survives a
reboot. On the engine host, `pae mcp:connect cursor` prints this with the values filled in:

```bash
cursor --add-mcp '{"name":"panelalpha-engine","type":"http","url":"https://<engine-host>:2011/mcp","headers":{"Authorization":"Bearer <token>"}}'
```

Reload the window. Tools & MCP should list `panelalpha-engine`.

For the create/debug skills, Customize → Plugins → import `https://github.com/panelalpha/agent-skills`
and install `engine`. A `panelalpha` server already in `mcp.json` will show up twice; remove it.

On a self-signed engine, Cursor launched from a desktop icon will not see `NODE_EXTRA_CA_CERTS`
from your shell. Start it from a terminal where that is set, or give the engine a real certificate.

### Grok

Grok plugin install has no `--config`. The durable stand-in is `grok mcp add`, which writes the URL
and token to `~/.grok/config.toml`. The plugin brings the skills. `pae mcp:connect grok` prints this
as one paste:

```bash
grok plugin marketplace add panelalpha/agent-skills && \
  grok plugin install engine --trust && \
  grok mcp add --transport http panelalpha-engine https://<engine-host>:2011/mcp \
    --header "Authorization: Bearer <token>"
```

`--trust` is required or the skills stay blocked. `--transport http` is required. Check with
`grok mcp list` / `grok mcp doctor`; the server name is `panelalpha-engine`. Skills are
`/engine:create-project` and `/engine:debug-project`.

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
stays empty. Register the server separately; `pae mcp:connect gemini` prints this with the values
filled in:

```bash
gemini mcp add --transport http panelalpha-engine https://<engine-host>:2011/mcp \
  --scope user --header "Authorization: Bearer <token>"
```

`--scope user` keeps the server available outside whichever project you ran the command in. Check with
`gemini mcp list`; the server name is `panelalpha-engine`. Skills are `/engine:create-project` and
`/engine:debug-project` (`gemini skills list` to confirm they loaded).

To update: `gemini extensions update engine`.

### Codex

Codex plugin install has no `--config`. The plugin brings the skills; the MCP server is registered
separately with `codex mcp add`, which writes the URL and a bearer-token env var reference to
`~/.codex/config.toml`. `pae mcp:connect codex` prints this as one paste:

```bash
codex plugin marketplace add panelalpha/agent-skills && \
  codex plugin add engine@panelalpha && \
  export PANELALPHA_MCP_TOKEN=<token> && \
  codex mcp add panelalpha-engine --url https://<engine-host>:2011/mcp --bearer-token-env-var PANELALPHA_MCP_TOKEN
```

Put the `export` line in your shell profile too, or the token will not survive a new shell. Check with
`codex mcp list`; the server name is `panelalpha-engine`. Skills are `/engine:create-project` and
`/engine:debug-project`.

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

## Adding a plugin for another product

Put it next to `engine/`, for example `panel/`, and keep it separate from `engine/` everywhere:

- Its own plugin name, used as the folder name and in every marketplace file.
- Its own MCP server name, such as `panelalpha-panel`.
- Its own `userConfig` (Claude) and `variables` (Cursor), so each product has its own URL and token.
- Skill descriptions that name the product, so an agent does not pick an engine skill for a panel task.

Then add an entry for it to every marketplace file (Claude, Codex, Cursor, Grok), and give it its own
`gemini-extension.json` — Gemini has no marketplace file, so each product's plugin folder needs one.

## Notes

- The engine decides what a token may do: `MCP_PERMISSION_MODE`, `MCP_TOOLSETS` and `MCP_DENIED_TOOLS`
  in `.env-core` set which tools a client sees.
- A plugin's URL and token are set once per machine, so one install talks to one engine. For more
  engines, add them as plain MCP servers per project (`claude mcp add --scope local …`).
