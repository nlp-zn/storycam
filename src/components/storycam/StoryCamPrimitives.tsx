"use client";

import type { ComponentProps, ReactNode } from "react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StoryCamPanelProps = ComponentProps<typeof motion.div> & {
  glow?: "cyan" | "pink" | "none";
};

export function StoryCamPanel({ className, glow = "cyan", ...props }: StoryCamPanelProps) {
  return (
    <motion.div
      className={cn(
        "storycam-glass",
        glow === "cyan" && "shadow-[0_0_34px_rgba(0,240,255,0.1)]",
        glow === "pink" && "shadow-[0_0_34px_rgba(255,75,137,0.12)]",
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1, y: 0 }}
      {...props}
    />
  );
}

export function StoryCamActionButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return <Button className={cn("storycam-action-button", className)} {...props} />;
}

export function StoryCamStatusBadge({
  className,
  ...props
}: ComponentProps<typeof Badge>) {
  return <Badge className={cn("h-auto min-h-6 rounded-full", className)} {...props} />;
}

export function StoryCamBottomDock({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={cn("storycam-bottom-dock", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function StoryCamSkeletonLine({ className }: { className?: string }) {
  return <Skeleton className={cn("h-2 rounded-full bg-white/10", className)} />;
}

export function StoryCamSectionHero({
  kicker,
  title,
  description,
  status
}: {
  description: string;
  kicker: string;
  status?: ReactNode;
  title: string;
}) {
  return (
    <header className="storycam-section-hero">
      <div className="storycam-section-kicker">
        <span />
        <p>{kicker}</p>
        <span />
      </div>
      <h1 className="storycam-heading-xl">{title}</h1>
      <p>{description}</p>
      {status}
    </header>
  );
}
