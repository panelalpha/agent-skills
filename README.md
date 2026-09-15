<div align="center">

<h1>PanelAlpha agent skills</h1>

<p>
Plugins for the AI assistant you already use. They teach it how to put a site on PanelAlpha Engine, and how to debug one that failed.
</p>

<p>
<a href="#set-it-up"><b>Get started</b></a> ·
<a href="#things-you-can-just-ask-for">Things you can ask for</a> ·
<a href="#your-assistant"><b>Your assistant</b></a> ·
<a href="#talk-to-us-on-discord"><b>Discord</b></a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="#set-it-up"><img src="https://img.shields.io/badge/skills-create%20%2B%20debug-2f8f46" alt="create and debug skills"></a>
<a href="#your-assistant"><img src="https://img.shields.io/badge/assistants-10-6f42c1" alt="10 assistants"></a>
<a href="#license"><img src="https://img.shields.io/badge/license-MIT-0b7285" alt="MIT"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Join Discord"></a>
</p>

</div>

---

## In short

**PanelAlpha Engine** is what you install on a VPS. **This repo** is what you install in your assistant, on your own computer.

- **Two skills.** `create-project` puts a site online. `debug-project` reads the log and fixes what it can when a deploy fails or a site does not answer.
- **You ask in plain words.** The assistant talks to the engine over **MCP**, the interface it uses to call tools on your server.
- **The engine stays in charge.** The AI never gets root. What it may do is decided on the server, before you connect it.

You need an engine first. If you do not have one yet:

```bash
curl -fsSL https://get.panelalpha.com/engine | sh
```

[**Join the Discord**](https://discord.gg/9twHWR7xGX). That is the main place to ask, show what you deployed, and talk to the people who build this.

---

## Set it up

### 1. Engine is on your VPS

The engine is the hosting. These plugins do not replace it.

### 2. Get the commands for your assistant

On the **engine server**, not on your laptop:

```bash
pae connect
```

Pick your assistant with the arrow keys. It prints the exact commands, with your address and a token already filled in.

### 3. Run what it printed. Then ask.

Run those commands **on your own computer**. That installs the `engine` plugin from this repo and connects the assistant to your server.

Then say it the way you would say it to a person:

```text
Deploy my application https://github.com/anna/invoicer on this PanelAlpha Engine.
```

What this does: the assistant creates a **project** (one website on this server), builds the app, and gives it an address with HTTPS.

What you should see: a web address. Open the address it gives you. Every project gets a free `panelalpha.online` name until you add your own domain.

A token with default permissions can delete a whole project. You can hand out a read-only one instead, or take single tools away. That lives on the engine, not in this plugin.

---

## Things you can just ask for

These are not magic phrases. They show the level of detail worth giving:

| You say | What happens |
|:---|:---|
| `Deploy github.com/org/app on this engine.` | The create skill inspects the repo, creates a project, deploys it, and checks that the site answers. |
| `This site does not open. Read the deploy log and fix what you can.` | The debug skill reads the failure, looks at what the site actually serves, changes what is fixable, and tries again. |
| `Install WordPress here, admin user anna.` | WordPress installed and ready. |
| `Create a MySQL database for this project and a user for it.` | Database, user and privileges, without you touching SQL. |
| `List the projects on this engine.` | A read-only check that the connection works. An empty list on a new engine is a success. |

The skills are `/engine:create-project` and `/engine:debug-project`. On Pi, Hermes and OpenClaw they are `/create-project` and `/debug-project`. The assistant also uses them on its own.

---

## Your assistant

<div align="center">

<img src="https://github.com/claude.png" width="46" alt="Claude Code">&nbsp;&nbsp;
<img src="https://github.com/cursor.png" width="46" alt="Cursor">&nbsp;&nbsp;
<img src="https://github.com/openai.png" width="46" alt="Codex">&nbsp;&nbsp;
<img src="https://github.com/google-gemini.png" width="46" alt="Gemini CLI">&nbsp;&nbsp;
<img src="https://github.com/xai-org.png" width="46" alt="Grok">&nbsp;&nbsp;
<img src="https://opencode.ai/apple-touch-icon-v3.png" width="46" alt="OpenCode">&nbsp;&nbsp;
<img src="https://pi.dev/logo-auto.svg" width="46" alt="Pi">&nbsp;&nbsp;
<img src="https://github.com/openclaw.png" width="46" alt="OpenClaw">

<sub><b>Claude Code&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Codex&nbsp; · &nbsp;Gemini CLI&nbsp; · &nbsp;Grok&nbsp; · &nbsp;OpenCode&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;Pi&nbsp; · &nbsp;Hermes&nbsp; · &nbsp;OpenClaw</b></sub>

</div>

Copy the lines `pae connect` printed. The blocks below use `203.0.113.10` as a stand-in address. That is not your server.

Most assistants install the skills from this repo, then connect to the engine separately. Claude Code is the exception: one install does both.

<details>
<summary><b>Claude Code</b></summary>

```bash
claude plugin marketplace add panelalpha/agent-skills
claude plugin install engine@panelalpha \
  --config "server_url=https://203.0.113.10:2011/mcp" \
  --config "api_token=<token>"
```

Without `--config`, Claude Code asks for both values when the plugin is enabled. The token is stored as a secret, never in `settings.json`.

On an engine with a self-signed certificate, start Claude Code with `NODE_EXTRA_CA_CERTS` pointing at a copy of `crt/server.cert`.

</details>

<details>
<summary><b>Cursor</b></summary>

Paste the prompt from `pae connect cursor` into a Cursor **Agent** chat (not Ask). That installs the plugin and writes the connection to `~/.cursor/mcp.json`.

If you add the connection yourself, open **Settings → Tools & MCP → New MCP Server** and paste the block the server printed. Then **Customize → Plugins**, import `https://github.com/panelalpha/agent-skills`, and install `engine`. Use `~/.cursor/mcp.json` (all projects), not a file inside a project, or you risk committing the token.

</details>

<details>
<summary><b>Codex</b></summary>

```bash
codex plugin marketplace add panelalpha/agent-skills
codex plugin add engine@panelalpha
PANELALPHA_MCP_TOKEN='<token>' codex mcp add panelalpha-engine \
  --url https://203.0.113.10:2011/mcp \
  --bearer-token-env-var PANELALPHA_MCP_TOKEN
```

The token goes in front so Codex stores the *name* of the variable. Put `export PANELALPHA_MCP_TOKEN='<token>'` in your shell profile too.

</details>

<details>
<summary><b>Gemini CLI</b></summary>

Gemini has no marketplace. Clone this repo and point at `engine/`:

```bash
git clone https://github.com/panelalpha/agent-skills
gemini extensions install ./agent-skills/engine
gemini mcp add --transport http --header "Authorization: Bearer <token>" \
  panelalpha-engine https://203.0.113.10:2011/mcp
```

Every option goes before the name and address. Add `--scope user` with the other flags to keep the server for every project.

</details>

<details>
<summary><b>Grok</b></summary>

```bash
grok plugin marketplace add panelalpha/agent-skills
grok plugin install engine --trust
grok mcp add --transport http panelalpha-engine https://203.0.113.10:2011/mcp \
  --header "Authorization: Bearer <token>"
```

`--trust` is required or the skills stay blocked. `--transport http` is required.

</details>

<details>
<summary><b>Windsurf</b></summary>

```bash
devin plugins install panelalpha/agent-skills#engine
devin mcp add -s user -H "Authorization: Bearer <token>" \
  panelalpha-engine https://203.0.113.10:2011/mcp
```

A local checkout works too: `devin plugins install ./agent-skills/engine`.

On Cascade (the older Windsurf agent, no `devin` command), paste the MCP JSON from `pae connect` into `~/.codeium/windsurf/mcp_config.json`. That file uses `serverUrl`, not `url`. Then load the skills by hand:

```bash
mkdir -p ~/.codeium/windsurf/skills
ln -s /path/to/agent-skills/engine/skills/create-project ~/.codeium/windsurf/skills/create-project
ln -s /path/to/agent-skills/engine/skills/debug-project ~/.codeium/windsurf/skills/debug-project
```

</details>

<details>
<summary><b>Pi</b></summary>

```bash
git clone https://github.com/panelalpha/agent-skills
pi install ./agent-skills/engine
pi install npm:pi-mcp-adapter
```

Restart Pi after the adapter. Then paste the JSON from `pae connect pi` into `~/.config/mcp/mcp.json`. On a self-signed engine, add `"caFile": "~/panelalpha-engine.cert"` to that server entry.

</details>

<details>
<summary><b>Hermes</b></summary>

```bash
git clone https://github.com/panelalpha/agent-skills
hermes plugins install ./agent-skills/engine --enable
hermes mcp add panelalpha-engine --url https://203.0.113.10:2011/mcp --auth header
```

`--enable` is required or the plugin stays disabled. `--auth header` is required. It asks whether the server needs authentication (yes) and whether to enable every tool (yes). `pae connect hermes` also prints YAML for `~/.hermes/config.yaml`. To skip typing the token, put `MCP_PANELALPHA_ENGINE_API_KEY` in `~/.hermes/.env`.

</details>

<details>
<summary><b>OpenClaw</b></summary>

```bash
git clone https://github.com/panelalpha/agent-skills
openclaw plugins install ./agent-skills/engine
openclaw mcp add panelalpha-engine \
  --url https://203.0.113.10:2011/mcp \
  --transport streamable-http \
  --header "Authorization: Bearer <token>"
```

`--transport streamable-http` is required.

</details>

<details>
<summary><b>OpenCode</b></summary>

The npm package is not published yet. Point `opencode.json` at a checkout of this repo:

```json
{
  "plugin": [
    ["file:///path/to/agent-skills/engine/opencode.js",
     { "url": "https://203.0.113.10:2011/mcp", "token": "{env:PANELALPHA_MCP_TOKEN}" }]
  ]
}
```

`PANELALPHA_MCP_URL` and `PANELALPHA_MCP_TOKEN` in the environment work instead of the options.

</details>

Using something else? Any assistant that speaks MCP can still talk to the engine. The skills in this repo are extra: they teach the order of work. Without them you connect MCP by hand and the assistant has the tools, but not the how-to.

---

## FAQ

<details>
<summary><b>Do I need this if I already connected MCP?</b></summary>

The connection gives the assistant tools. The skills tell it how to use them: inspect the repo first, wait out a deploy instead of creating a second project, read the failure code before guessing. You can run the engine with MCP alone. The plugin is the how-to on top.
</details>

<details>
<summary><b>Which assistants work?</b></summary>

Claude Code, Cursor, Codex, Gemini CLI, Grok, OpenCode, Windsurf, Pi, Hermes and OpenClaw have a plugin here. Anything that speaks MCP can connect to the engine even if it is not on that list. Run `pae connect` on the server and pick yours.
</details>

<details>
<summary><b>Where does the token live?</b></summary>

On your computer, in that assistant's own config. Claude Code stores it as a secret. Codex stores the name of an environment variable. Cursor, Pi and similar write it into an MCP config file. Never put that file inside a project you commit. The engine decides what the token may do: `MCP_PERMISSION_MODE`, `MCP_TOOLSETS` and `MCP_DENIED_TOOLS` in `.env-core`.
</details>

<details>
<summary><b>Can I limit what my assistant is allowed to do?</b></summary>

Yes, and it is worth doing before you paste a token. You can give it a read-only token, allow changes but not deletions, or deny individual tools such as `project_delete`. That lives on the engine, not in this plugin.
</details>

<details>
<summary><b>The assistant connected, then failed with a certificate error.</b></summary>

The engine is using a self-signed certificate that your computer does not trust. Give the engine a real certificate, or copy `crt/server.cert` from the server and point `NODE_EXTRA_CA_CERTS` at it (Claude Code, Cursor, and other Node-based tools). Start the assistant from that terminal. A desktop icon will not see a variable you set in a different shell.
</details>

<details>
<summary><b>One install, several engines?</b></summary>

A plugin's URL and token are set once per machine, so one install talks to one engine. For more engines, add them as plain MCP servers per project.
</details>

---

## Talk to us on Discord

Discord is the **main place** to reach us. Ask a question, show what you deployed, or follow what we are working on.

**[Join the PanelAlpha Discord](https://discord.gg/9twHWR7xGX)**

Not on Discord? The [community forum](https://community.panelalpha.com/) is open too.

---

## License

These plugins are open source under the MIT license.
