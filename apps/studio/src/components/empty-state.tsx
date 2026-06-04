"use client";

import { useEffect, useState } from "react";
import { Terminal, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SDK_SNIPPET = `import { createClient } from "@agent-replay/sdk";

const replay = createClient(); // → http://localhost:3000
await replay.run("my-agent", async (trace) => {
  const span = trace.startSpan("step", { kind: "tool" });
  // ... your agent logic ...
  span.end();
});
await replay.shutdown(); // flush before exit`;

export function EmptyState() {
  // Show the real origin Studio is served from (client-only).
  const [ingestUrl, setIngestUrl] = useState("http://localhost:3000/api/ingest");
  useEffect(() => {
    setIngestUrl(`${window.location.origin}/api/ingest`);
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Card className="w-full max-w-2xl border-dashed">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <Terminal className="size-6 text-muted-foreground" />
          </div>
          <CardTitle>No traces recorded yet</CardTitle>
          <CardDescription>
            Studio is listening for traces at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {ingestUrl}
            </code>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 text-sm">
          {/* Option 1 — demo */}
          <div className="space-y-2">
            <p className="font-medium">1 · Record the bundled demo</p>
            <p className="text-muted-foreground">
              From the repo, with Studio running:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              <code>pnpm agent-replay demo</code>
            </pre>
          </div>

          {/* Option 2 — SDK */}
          <div className="space-y-2">
            <p className="font-medium">2 · Instrument your own agent</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
              <code>{SDK_SNIPPET}</code>
            </pre>
          </div>

          {/* Auto-refresh notice */}
          <div className="flex items-center justify-center gap-2 border-t pt-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Waiting for traces — this list refreshes automatically.</span>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Full guide:{" "}
            <code className="rounded bg-muted px-1 py-0.5">docs/quickstart.md</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
