/* Search-specific imports stay available at this path, but their implementation
   lives with the canonical monster identity and family rules. */
export {
  isSameOrHigherAwakening,
  monsterAwakeningPosition,
  withHigherAwakenings,
} from './monster-identity';
export type { MonsterAwakeningPosition } from './monster-identity';
