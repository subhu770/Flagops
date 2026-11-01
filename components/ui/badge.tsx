import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "purple" | "outline";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  size = "md",
  children,
  ...props
}) => {
  const base = "inline-flex items-center font-medium rounded-full tracking-wide";

  const variants = {
    default: "bg-slate-800 text-slate-300 border border-slate-700/60",
    success: "bg-emerald-950/70 text-emerald-300 border border-emerald-500/30",
    warning: "bg-amber-950/70 text-amber-300 border border-amber-500/30",
    danger: "bg-rose-950/70 text-rose-300 border border-rose-500/30",
    info: "bg-blue-950/70 text-blue-300 border border-blue-500/30",
    purple: "bg-purple-950/70 text-purple-300 border border-purple-500/30",
    outline: "bg-transparent text-slate-400 border border-slate-700",
  };

  const sizes = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  };

  return (
    <span className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  );
};
