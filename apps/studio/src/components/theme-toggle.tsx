"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeOption {
  value: ThemeChoice;
  label: string;
  Icon: typeof Sun;
}

const OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Three-way theme picker for the top nav. The trigger icon reflects the
 * *effective* theme so the visual matches what the user sees right now.
 */
export function ThemeToggle() {
  const { choice, effective, set } = useTheme();

  const TriggerIcon = effective === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Theme: ${choice} (effective ${effective})`}
            title={`Theme: ${choice}`}
          >
            <TriggerIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-32">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => set(value)}
            className={cn(
              "gap-2 text-sm",
              choice === value && "font-semibold text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
