/** @type {import('next').NextConfig} */
const nextConfig = {
  // OnchainKit / wagmi bazı opsiyonel native bağımlılıkları dış bırakır.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  async headers() {
    return [
      {
        source: "/.well-known/farcaster.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      {
        // Kart, Farcaster/Base App crawler'ları tarafından cross-origin çekilir.
        source: "/api/card",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        // Baz güvenlik header'ları.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
