import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async redirects() {
    // Home is Today; a product's name opens its first page; addresses copied from the current dashboard
    // (/dashboard/<page>) open the same page here.
    const product = [
      ['home', 'today'],
      ['touchpoint', 'today'],
      ['catalyst', 'engine-1'],
      ['canvas', 'deliverables'],
      ['pipeline', 'engine-3'],
      ['atlas', 'knowledge-base'],
      ['settings', 'integrations'],
    ]
    return [
      { source: '/', destination: '/today', permanent: false },
      { source: '/dashboard', destination: '/today', permanent: false },
      { source: '/dashboard/login', destination: '/login', permanent: false },
      ...product.map(([from, to]) => ({ source: '/dashboard/' + from, destination: '/' + to, permanent: false })),
      { source: '/dashboard/:page', destination: '/:page', permanent: false },
      ...product.map(([from, to]) => ({ source: '/' + from, destination: '/' + to, permanent: false })),
    ]
  },
}

export default nextConfig
