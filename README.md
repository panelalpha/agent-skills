# PanelAlpha agent plugins

Plugins for AI coding agents, one per PanelAlpha product. The marketplace is `panelalpha`, and each
plugin is installed as `<plugin>@panelalpha`.

| Plugin | Product | MCP server |
|---|---|---|
| `engine` | PanelAlpha Engine, the hosting engine (MCP on port 2011) | `panelalpha-engine` |

Each plugin folder works in Claude Code, Codex and OpenCode:

| File | Read by |
|---|---|
| `.claude-plugin/plugin.json`, `.mcp.json` | Claude Code |
| `.codex-plugin/plugin.json` | Codex (`mcpServers: {}` stops it loading Claude's `.mcp.json`) |
| `package.json`, `opencode.js` | OpenCode |
| `skills/` | all three |

The marketplace files at the top are `.claude-plugin/marketplace.json` for Claude Code and
`.agents/plugins/marketplace.json` for Codex.

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

### Codex

A Codex plugin cannot take a per-user URL or token, so the plugin brings the skills and the MCP server is
registered on its own:

```bash
codex plugin marketplace add panelalpha/agent-skills
codex plugin add engine@panelalpha

export PANELALPHA_MCP_TOKEN=<token>          # put this in your shell profile
codex mcp add panelalpha-engine --url https://<engine-host>:2011/mcp --bearer-token-env-var PANELALPHA_MCP_TOKEN
```

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

- Its own plugin name, used as the folder name and in both manifests.
- Its own MCP server name, such as `panelalpha-panel`.
- Its own `userConfig`, so each product has its own URL and token.
- Skill descriptions that name the product, so Claude does not pick an engine skill for a panel task.

Then add an entry for it to both marketplace files.

## Notes

- The engine decides what a token may do: `MCP_PERMISSION_MODE`, `MCP_TOOLSETS` and `MCP_DENIED_TOOLS`
  in `.env-core` set which tools a client sees.
- A plugin's URL and token are set once per machine, so one install talks to one engine. For more
  engines, add them as plain MCP servers per project (`claude mcp add --scope local …`).
