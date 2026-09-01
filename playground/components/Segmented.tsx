import { useRadioGroup } from "./useRadioGroup";

/** Segmented control. For a few short, mutually exclusive options — not a <select>. */
interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const { groupProps, radioProps } = useRadioGroup(options, o => o.value === value);

  return (
    <div className="segmented" role="radiogroup" aria-label={label} {...groupProps}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "on" : undefined}
          onClick={() => onChange(o.value)}
          {...radioProps(i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
