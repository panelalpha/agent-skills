// OpenCode plugin: registers the PanelAlpha Engine MCP server and the shared skills.
import { fileURLToPath } from "node:url"

const skillsDir = fileURLToPath(new URL("./skills", import.meta.url))

export const PanelAlpha = async (_input, options = {}) => ({
  config: async (config) => {
    const url = options.url ?? process.env.PANELALPHA_MCP_URL
    const token = options.token ?? process.env.PANELALPHA_MCP_TOKEN

    config.skills ??= {}
    config.skills.paths = [...(config.skills.paths ?? []), skillsDir]

    // A panelalpha-engine server the user configured by hand wins over this one.
    if (url && token && !config.mcp?.["panelalpha-engine"]) {
      config.mcp ??= {}
      config.mcp["panelalpha-engine"] = {
        type: "remote",
        url,
        headers: { Authorization: `Bearer ${token}` },
        oauth: false,
      }
    }
  },
})
