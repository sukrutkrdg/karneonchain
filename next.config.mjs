/** @type {import('next').NextConfig} */
const nextConfig = {
  // OnchainKit / wagmi bazı opsiyonel native bağımlılıkları dış bırakır.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  // Paylaşılan kartların başka istemcilerde (Farcaster/Base App) embed edilmesi için.
  async headers() {
    return [
      {
        source: "/.well-known/farcaster.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
