import React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  size = "md",
  label,
  id,
}) => {
  const switchSizes = {
    sm: "w-8 h-4.5 p-0.5",
    md: "w-11 h-6 p-0.5",
    lg: "w-14 h-7.5 p-1",
  };

  const thumbSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-5 h-5",
    lg: "w-5.5 h-5.5",
  };

  const thumbTranslate = {
    sm: checked ? "translate-x-3.5" : "translate-x-0",
    md: checked ? "translate-x-5" : "translate-x-0",
    lg: checked ? "translate-x-6.5" : "translate-x-0",
  };

  return (
    <div className="inline-flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed",
          checked
            ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
            : "bg-slate-700 hover:bg-slate-600",
          switchSizes[size],
          className
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out",
            thumbSizes[size],
            thumbTranslate[size]
          )}
        />
      </button>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-slate-200 select-none cursor-pointer"
        >
          {label}
        </label>
      )}
    </div>
  );
};
