import type { NextConfig } from 'next';

// Production runs as one Node process: the NestJS server answers /api and hands every
// other path to Next.js. In development (two processes) set API_URL so /api is proxied.
const apiUrl = process.env.API_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    return apiUrl ? [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }] : [];
  },
  poweredByHeader: false,
};

export default nextConfig;
