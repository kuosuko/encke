import type { ButtonHTMLAttributes } from "react";

/**
 * One button, three weights:
 *   filled    the primary action — at most one per screen
 *   outlined  secondary actions
 *   text      incidental things (copy, remove, swap)
 */
interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "outlined" | "text";
}

export function Pill({ variant = "outlined", className, ...rest }: PillProps) {
  const base = variant === "text" ? "link" : `pill pill-${variant}`;
  return <button type="button" className={className ? `${base} ${className}` : base} {...rest} />;
}
