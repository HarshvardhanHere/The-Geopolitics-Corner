/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! WARN !!
    // Danger: This allows production builds to complete even if your project has type errors.
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // This tells Vercel to treat d3 as an external module,
      // preventing it from trying to compile it during build.
      config.externals.push('d3');
    }
    return config;
  },
};

export default nextConfig;