import { useLayoutEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

export type DropdownProps = ComponentPropsWithoutRef<'select'> & {
  /** Opt-in only: without this prop the control has no empty option. */
  placeholder?: string;
};

/**
 * The one select surface in JASWA. Variants may adjust the control's reserved
 * measure, but the arrow, focus treatment and disabled state stay shared.
 */
export function Dropdown({ className, placeholder, children, value, defaultValue, ...props }: DropdownProps) {
  const selectedValue = value ?? defaultValue;
  const showingPlaceholder = placeholder !== undefined
    && (selectedValue === undefined || selectedValue === '');

  return <select
    {...props}
    value={value}
    defaultValue={defaultValue}
    data-placeholder={showingPlaceholder ? '' : undefined}
    className={['jaswa-select', className].filter(Boolean).join(' ')}
  >
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {children}
  </select>;
}

const ruleGlyph = '─';

/**
 * A line between two parts of a Dropdown's list, one row tall, with the same
 * space at either end as before the field's text.
 *
 * An `<hr>` was tried first. Chrome draws a select's list itself and ignores
 * every style on one: it came out as a faint hairline from edge to edge. An
 * option is the one thing in that list it does style, so the line is a disabled
 * option written in box-drawing rules, measured to the field. Disabled keeps it
 * out of choice and of arrow-key steps.
 */
export function SelectRule() {
  const ref = useRef<HTMLOptionElement>(null);
  const [length, setLength] = useState(0);

  useLayoutEffect(() => {
    const select = ref.current?.closest('select');
    const context = document.createElement('canvas').getContext('2d');
    if (!select || !context) return;
    const measure = () => {
      const style = getComputedStyle(select);
      context.font = style.font;
      const glyph = context.measureText(ruleGlyph).width;
      // The list has no chevron, so the line keeps the field's start inset at
      // both ends rather than the chevron's narrower gutter on the right.
      const room = select.clientWidth - 2 * parseFloat(style.paddingLeft);
      setLength(glyph > 0 && room > 0 ? Math.floor(room / glyph) : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(select);
    // The field's face may arrive after the first measure, and the rule's
    // glyph width with it.
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, []);

  return <option ref={ref} className="select-rule" disabled aria-hidden="true">{ruleGlyph.repeat(length)}</option>;
}
