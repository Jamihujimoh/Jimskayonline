import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/katex/dist/katex.min.css',
      './node_modules/katex/dist/fonts/**',
    ],
  },
  outputFileTracingExcludes: {
    '*': [
      './copy/**',
      './docs/**',
      './release/**',
      './desktop/**',
      './jimskay-ai-exact-desktop-v6/**',
      './*.zip',
      './src.zip',
      './src (2).zip',
    ],
  },
  allowedDevOrigins: ['127.0.0.1'],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Added chromium and puppeteer-core alongside pdfkit to prevent bundler issues
  serverExternalPackages: ['pdfkit', '@sparticuz/chromium', 'puppeteer-core', 'katex'],
};

export default nextConfig;