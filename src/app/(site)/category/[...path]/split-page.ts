/** `["celebrity","news","page","3"]` -> `{ segments: ["celebrity","news"], page: 3 }`
 *
 *  Shared by page.tsx and layout.tsx: the layout is the 404 gate (see the note in
 *  layout.tsx), so both have to read a URL the same way or they would disagree
 *  about which URLs exist. */
export function splitPage(path: string[]): { segments: string[]; page: number } | null {
  if (path.length >= 3 && path[path.length - 2] === "page") {
    const page = Number(path[path.length - 1]);
    if (!Number.isInteger(page) || page < 2) return null; // page/1 and page/abc are not URLs we mint
    return { segments: path.slice(0, -2), page };
  }
  return { segments: path, page: 1 };
}
