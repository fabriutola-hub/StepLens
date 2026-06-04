import { Workbench } from "@/components/workbench/workbench";

// `/traces` and `/` share the same workbench so the detail back-link and any
// bookmarked URLs keep working.
export default function TracesPage() {
  return <Workbench />;
}
