/** "seo_manager" → "Seo Manager"; two roles → "Author, Contributor".
 *
 *  A WordPress account can hold SEVERAL roles (this site does it — an Author
 *  who is also a Contributor), and the old `roles[0]` label silently hid every
 *  role but the first. Roles are Latin slugs, so the capitalisation is safe.
 *  Shared by the sidebar chip, the profile screen and the Users list so the
 *  three can never disagree again. */
export function roleLabel(roles: readonly string[]): string {
  const pretty = roles
    .map((slug) => slug.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter(Boolean);
  return pretty.length ? pretty.join(", ") : "—";
}
