import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex flex-col gap-2", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground h-9 data-[variant=line]:h-auto data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

// NOTE: base-ui marks the active tab with aria-selected, so styling keys off
// the v3-built-in `aria-selected:` variant (v4-only `data-active:` shorthand
// silently compiled to nothing on this Tailwind version).
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // segmented (default): filled pill on the active tab
        "group-data-[variant=default]/tabs-list:aria-selected:bg-card group-data-[variant=default]/tabs-list:aria-selected:text-foreground group-data-[variant=default]/tabs-list:aria-selected:shadow-sm dark:group-data-[variant=default]/tabs-list:aria-selected:border-input dark:group-data-[variant=default]/tabs-list:aria-selected:bg-input/30",
        // line: neutral underline on the active tab
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:aria-selected:bg-transparent group-data-[variant=line]/tabs-list:aria-selected:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[variant=line]/tabs-list:aria-selected:after:opacity-100 after:inset-x-0 after:-bottom-[3px] after:h-0.5 after:rounded-full",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
