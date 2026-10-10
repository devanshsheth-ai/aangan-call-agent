/** @type {import('next').NextConfig} */
const nextConfig = {
  // The knowledge files are read from disk at runtime; make sure Vercel bundles them with these routes.
  outputFileTracingIncludes: {
    "/api/vaani/webhook": ["./knowledge/**/*"],
    "/api/eval": ["./knowledge/**/*"],
  },
};
export default nextConfig;
