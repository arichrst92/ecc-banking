"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Tombol submit untuk form Server Action.
 * Otomatis pending state via useFormStatus.
 * Wajib di-render di DALAM <form> supaya hook bekerja.
 */
export function LoadingButton({
  children,
  loadingText,
  className,
  disabled,
  variant = "primary",
  size = "md",
  confirm,
}: {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
  variant?: "primary" | "gold" | "outline" | "danger" | "success";
  size?: "sm" | "md";
  confirm?: string; // window.confirm() text
}) {
  const { pending } = useFormStatus();

  const variantClass = {
    primary: "btn-primary",
    gold: "btn-gold",
    outline: "btn-outline",
    danger: "btn-danger",
    success: "btn-success",
  }[variant];

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (confirm && !window.confirm(confirm)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <button
      type="submit"
      onClick={confirm ? handleClick : undefined}
      disabled={pending || disabled}
      className={cn(
        "btn",
        variantClass,
        size === "sm" && "btn-sm",
        (pending || disabled) && "opacity-60 cursor-not-allowed",
        className
      )}
      aria-busy={pending}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          <span>{loadingText ?? "Memproses..."}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="animate-spin shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
