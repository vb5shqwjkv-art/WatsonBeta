/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep server-only packages out of the client bundle.
  serverExternalPackages: ["openai", "docx"],
};

export default nextConfig;
