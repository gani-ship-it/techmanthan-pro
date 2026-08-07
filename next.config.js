/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['undici', 'firebase', '@firebase/auth', '@firebase/storage', '@firebase/app'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('undici');
    }
    return config;
  }
};

module.exports = nextConfig;

