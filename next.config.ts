import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseHostname: string | undefined;
try {
  supabaseHostname = new URL(supabaseUrl).hostname;
} catch {
  supabaseHostname = undefined;
}

const nextConfig: NextConfig = {
  // Native module (QR sign PNG rendering) — must stay external, bundlers can't inline it.
  serverExternalPackages: ["@resvg/resvg-js"],
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
