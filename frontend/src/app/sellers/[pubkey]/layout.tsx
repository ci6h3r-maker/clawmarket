// Static params for static export - empty array means all pages render client-side
export function generateStaticParams() {
  return [];
}

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
