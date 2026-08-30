/* Does the leading space inside the note survive JSX whitespace handling? */
const saveFolder: string | null = null;
export const probe = <span>
  {saveFolder ?? 'Browser downloads'}
  {!saveFolder && <span className="value-note"> (default)</span>}
</span>;
