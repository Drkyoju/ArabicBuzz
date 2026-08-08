import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CranL / Docker: `node server.js` from `.next/standalone`
  output: 'standalone',
  serverExternalPackages: ['grammy', '@modelcontextprotocol/sdk'],
  // Local pdf-tools-venv has absolute python symlinks; Turbopack panics if it traces them.
  outputFileTracingExcludes: {
    '*': [
      './scripts/pdf-tools-venv/**',
      './tmp/pdf-venv/**',
      './tmp/pdf-tool-bench/**',
      './.openclaw/**',
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
