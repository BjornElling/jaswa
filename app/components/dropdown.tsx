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
