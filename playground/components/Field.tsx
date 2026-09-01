import { useId } from "react";

/**
 * An input with its label stacked above it, inside the same bordered box.
 *
 * All three uses go through this one component:
 *   <Field label="URL" …/>                          plain input
 *   <Field label="Foreground" chip … onChipChange>   the swatch on the left edge is an invisible native picker
 *   <Field label="Tint" chip … readOnly>             derived, not editable
 */
interface FieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** A CSS colour. Passing one grows a swatch on the left edge. */
  chip?: string;
  /** Only a swatch with this is clickable: a transparent native <input type="color"> sits on top. */
  onChipChange?: (value: string) => void;
  type?: "text" | "url";
  maxLength?: number;
  placeholder?: string;
  readOnly?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  chip,
  onChipChange,
  type = "text",
  maxLength,
  placeholder,
  readOnly = false,
}: FieldProps) {
  const id = useId();

  const input = readOnly ? (
    <output className="hex" id={id}>
      {value}
    </output>
  ) : (
    <input
      id={id}
      className={chip ? "hex" : undefined}
      type={type}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      onChange={e => onChange?.(e.target.value)}
    />
  );

  // The container is deliberately a div, not a label: the swatch hides a native
  // colour input, and a label wrapping two focusable elements activates the
  // first one — so clicking the caption would open the colour picker instead of
  // focusing the text field. The label points at the text field explicitly.
  return (
    <div className={`field${chip ? ` field-colour${readOnly ? " field-derived" : ""}` : ""}`}>
      {chip && (
        <span className="chip" style={{ ["--well" as string]: chip }}>
          {onChipChange && (
            <input
              type="color"
              value={chip}
              aria-label={`${label} colour picker`}
              onChange={e => onChipChange(e.target.value)}
            />
          )}
        </span>
      )}
      <span className="field-body">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {input}
      </span>
    </div>
  );
}
