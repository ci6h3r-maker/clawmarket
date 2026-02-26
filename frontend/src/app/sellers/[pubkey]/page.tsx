import SellerClient from "./SellerClient";

// Required for static export with dynamic routes
export function generateStaticParams() {
  return [];
}

export default function SellerPage() {
  return <SellerClient />;
}
