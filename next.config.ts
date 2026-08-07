import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CranL / Docker: `node server.js` from `.next/standalone`
  output: 'standalone',
  serverExternalPackages: ['grammy', '@modelcontextprotocol/sdk'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
