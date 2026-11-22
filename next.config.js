/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/dashboard/edit', destination: '/dashboard/listings/edit', permanent: true },
      { source: '/projects/:slug/edit', destination: '/dashboard/projects/:slug/edit', permanent: true },
      { source: '/projects/:slug/bid', destination: '/dashboard/projects/:slug/bid', permanent: true },
      { source: '/projects/new', destination: '/dashboard/projects/new', permanent: true },
      { source: '/fleet', destination: '/dashboard/fleet', permanent: true },
      { source: '/list-your-vessel/apply', destination: '/dashboard/listings/new', permanent: true },
      { source: '/list-your-vessel', destination: '/operators', permanent: true },
      { source: '/for-researchers', destination: '/researchers', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'text/javascript' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Clear-Site-Data', value: '"cache", "storage"' },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oceans.quakefire.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
}

module.exports = nextConfig
