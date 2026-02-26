import SellerClient from "./SellerClient";

// Required for static export with dynamic routes
export async function generateStaticParams() {
  return [];
}

// Force dynamic rendering at runtime
export const dynamic = "force-static";
export const dynamicParams = true;

export default function SellerPage() {
  return <SellerClient />;
}
