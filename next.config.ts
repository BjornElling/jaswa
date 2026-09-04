import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* A local preview owns .next while it is running. Verification receives an
     isolated output directory so it never interrupts that preview. */
  distDir: process.env.JASWA_NEXT_DIST_DIR ?? '.next',
  turbopack: { root: process.cwd() },
};

export default nextConfig;
