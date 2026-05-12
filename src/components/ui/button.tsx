import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        primaryNeon:
          "rounded-full border-cyan-300 bg-[linear-gradient(90deg,var(--storycam-primary),#2563eb)] px-7 font-black text-black shadow-[0_0_22px_rgba(0,240,255,0.34)] hover:brightness-110 focus-visible:border-cyan-200 focus-visible:ring-cyan-300/35",
        secondaryGlass:
          "rounded-full border-[var(--storycam-outline-variant)] bg-[#1f1f1f]/50 px-7 font-black text-[var(--storycam-on-surface-variant)] hover:border-cyan-300/55 hover:text-[var(--storycam-primary-soft)] focus-visible:ring-cyan-300/25",
        dangerGlass:
          "rounded-full border-pink-400/45 bg-[#1f1f1f]/50 px-7 font-black text-pink-100 hover:border-pink-400/75 hover:text-pink-50 focus-visible:ring-pink-300/25",
        iconGlass:
          "rounded-full border-white/15 bg-black/35 text-[var(--storycam-on-surface)] hover:border-cyan-300/60 hover:text-[var(--storycam-primary)] focus-visible:ring-cyan-300/25",
        storyMode:
          "min-h-11 rounded-full border-white/12 bg-white/[0.055] px-5 py-3 text-[15px] font-black text-[#d5e0e1] hover:border-cyan-300/65 hover:bg-white/10 hover:text-white hover:shadow-[0_0_18px_rgba(0,240,255,0.16)] data-[pressed]:scale-[1.03] data-[pressed]:border-pink-400 data-[pressed]:bg-pink-500/25 data-[pressed]:text-pink-50 data-[pressed]:shadow-[0_0_24px_rgba(255,75,137,0.34),inset_0_0_18px_rgba(255,75,137,0.1)]",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        pill: "h-11 gap-2 px-5",
        dock: "h-11 gap-2 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
