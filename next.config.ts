import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No `images` allow-list: nothing here uses next/image. Venue photos are
  // plain <img> with fixed dimensions, so the allow-list governed nothing.
}

export default nextConfig
