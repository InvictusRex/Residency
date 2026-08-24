/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    unoptimized: true,
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend:8000/api/:path*',
      },
    ]
  },
}

export default nextConfig