import ProductClient from "./ProductClient";

// Required for static export with dynamic routes
export function generateStaticParams() {
  return [];
}

export default function ProductPage() {
  return <ProductClient />;
}
