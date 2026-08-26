"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

/**
 * Popover (Radix headless + tokens `--shell-*`).
 *
 * Distinto de `DropdownMenu`: esto es para contenido arbitrario —una lista
 * de notificaciones, por ejemplo— y no para un menú de acciones. Usar el menú
 * ahí le prometería a un lector de pantalla items navegables con flechas que
 * en realidad son texto.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "end", sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-[70] w-80 overflow-hidden rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] shadow-2xl outline-none",
        "transition-all duration-150",
        "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent };
