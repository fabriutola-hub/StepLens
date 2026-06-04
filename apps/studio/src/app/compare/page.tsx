import { CompareView } from "@/components/compare/compare-view";

// `searchParams` is awaited (Next 15+) so the client view receives plain ids —
// avoids a useSearchParams Suspense boundary.
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { left, right } = await searchParams;
  return <CompareView left={left} right={right} />;
}
