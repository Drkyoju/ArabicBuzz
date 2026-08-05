# Thin wrapper around Google MCP Toolbox for Databases (Streamable HTTP on /mcp).
# Upstream: https://github.com/googleapis/mcp-toolbox
# Pin the image tag in docker-compose.yml; keep this file for hosts that build from context.

ARG TOOLBOX_VERSION=1.8.0
FROM us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:${TOOLBOX_VERSION}

# Listen on all interfaces so Fly/Railway/Docker port maps work.
# Prefer --prebuilt=postgres/data for SQL-only (narrower than full admin toolset).
CMD ["--prebuilt", "postgres/data", "--address", "0.0.0.0", "--port", "5000"]
