import type { ComponentPropsWithoutRef } from 'react';

export type DropdownProps = ComponentPropsWithoutRef<'select'>;

/**
 * The one select surface in JASWA. Variants may adjust the control's reserved
 * measure, but the arrow, focus treatment and disabled state stay shared.
 */
export function Dropdown({ className, ...props }: DropdownProps) {
  return <select
    {...props}
    className={['jaswa-select', className].filter(Boolean).join(' ')}
  />;
}
