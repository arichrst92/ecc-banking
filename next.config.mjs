/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // pdfkit baca file font (.afm) dari node_modules saat runtime — jangan di-bundle
    // oleh webpack supaya file data-nya tetap ketemu di production build.
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

export default nextConfig;
