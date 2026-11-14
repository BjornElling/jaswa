/* Local file reads and downloads. Nothing here leaves the computer, and nothing
   here decodes: what a file means is the ingestion layer's to say. */

export async function fileToText(file: File): Promise<string> {
  return file.text();
}

export function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  /* Revoked after the click has been handled: some browsers abort a download
     whose object URL disappears in the same task. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
