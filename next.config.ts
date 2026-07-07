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
  // The QR sign generator reads these at runtime; public/ isn't on the
  // serverless filesystem unless explicitly traced into the function bundle.
  outputFileTracingIncludes: {
    "/api/promoter/events/[id]/distances/[distanceId]/checkpoints/[checkpointId]/download": [
      "./public/Font/Logik-ExtendedBoldOblique.ttf",
      "./public/PR_primarylogo.svg",
    ],
  },
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
