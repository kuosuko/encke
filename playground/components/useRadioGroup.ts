import type { KeyboardEvent } from "react";

/**
 * ARIA radio-group keyboard behaviour, shared by all three groups
 * (segmented control, colour swatches, built-in icons).
 *
 * The point is roving tabindex: exactly one item is in the tab order and the
 * arrow keys move within the group. Without it a keyboard user has to press
 * Tab eighteen times to get past the swatch row.
 *
 * The container comes from event.currentTarget rather than a ref of our own —
 * the swatch row's ref is already taken by the edge-fade hook, and this way
 * the two can coexist.
 */
export function useRadioGroup<T>(
  items: readonly T[],
  isSelected: (item: T, index: number) => boolean
) {
  // With nothing selected, make the first item focusable — otherwise the whole
  // group drops out of the tab order.
  const selected = items.findIndex(isSelected);
  const focusable = selected >= 0 ? selected : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : e.key === "Home"
            ? -Infinity
            : e.key === "End"
              ? Infinity
              : 0;
    if (!step) return;

    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    if (buttons.length === 0) return;

    const from = buttons.findIndex(b => b === document.activeElement);
    const next =
      step === -Infinity
        ? 0
        : step === Infinity
          ? buttons.length - 1
          : (Math.max(from, 0) + step + buttons.length) % buttons.length;

    e.preventDefault();
    // Per the ARIA radio pattern, moving focus also moves the selection.
    buttons[next].focus();
    buttons[next].click();
  };

  return {
    /** Spread onto the role="radiogroup" container */
    groupProps: { onKeyDown },
    /** Spread onto each role="radio" button */
    radioProps: (index: number) => ({ tabIndex: index === focusable ? 0 : -1 }),
  };
}
