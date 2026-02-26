// Static params for static export - empty array means all pages render client-side
export function generateStaticParams() {
  return [];
}

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
