"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertOctagon, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary. Catches unhandled errors in the Studio UI and
 * gives the user a "reload" + "copy error details" affordance instead of a
 * blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In a real project we'd POST to `/api/telemetry`, but Studio runs
    // locally and we want to keep no extra server surface. Log to the
    // browser console for now — maintainers with dev tools open will see it.
    console.error("[StepLens UI error]", error, info);
  }

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private handleCopy = async () => {
    if (!this.state.error) return;
    const text =
      `${this.state.error.name}: ${this.state.error.message}\n\n` +
      `${this.state.error.stack ?? "(no stack)"}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Error details copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-lg">
            <CardContent className="space-y-4 py-6">
              <div className="flex items-start gap-3">
                <AlertOctagon className="size-6 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    Something went wrong
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    An unexpected error happened in the Studio UI. Reload the
                    page to recover, or copy the error details to file a bug.
                  </p>
                </div>
              </div>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                {this.state.error.name}: {this.state.error.message}
              </pre>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.handleCopy}
                  className="gap-1.5"
                >
                  <Copy className="size-3.5" />
                  Copy error details
                </Button>
                <Button size="sm" onClick={this.handleReload} className="gap-1.5">
                  <RotateCcw className="size-3.5" />
                  Reload page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
