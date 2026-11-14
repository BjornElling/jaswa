import type { AccelerationState } from '../../workspace/acceleration-status';
import type { HelperConnection } from '../../workspace/ports';

/* These labels are display copy, kept beside the states they describe so a
   component cannot quietly invent a second vocabulary for the same verdict. */
export const accelerationLabels: Record<AccelerationState, string> = {
  checking: 'Checking',
  disabled: 'Disabled',
  ready: 'Connected',
  unavailable: 'Unavailable',
};

export const helperLabels: Record<HelperConnection['state'], string> = {
  checking: 'Waiting',
  ready: 'Connected',
  unavailable: 'Unavailable',
};
