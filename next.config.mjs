/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  webpack(config, { dev }) {
    if (dev)
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      }
    return config
  },
  experimental: { cpus: 2 },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      ...['/verify-email', '/forgot-password', '/reset-password'].map(
        (source) => ({
          source,
          headers: [
            { key: 'Referrer-Policy', value: 'no-referrer' },
            { key: 'Cache-Control', value: 'no-store' },
            { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          ],
        }),
      ),
    ]
  },
}

export default nextConfig
