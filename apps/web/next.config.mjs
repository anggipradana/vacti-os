/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow an isolated build dir (e.g. e2e) so a second `next` instance never corrupts the live .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // @vacti/* libs are TS source consumed directly from the monorepo.
  transpilePackages: [
    '@vacti/core',
    '@vacti/config',
    '@vacti/db',
    '@vacti/auth',
    '@vacti/queue',
    '@vacti/recon',
    '@vacti/api',
    '@vacti/threat-intel',
    '@vacti/reports',
  ],
  eslint: { ignoreDuringBuilds: true },
  // Report branding uploads (company logo, signatory signature images) go through server actions;
  // Next's 1MB default silently errors on those. Raise it so the uploads land.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};
export default nextConfig;
