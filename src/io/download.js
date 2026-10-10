export function downloadFile(filename, mimeType, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileSlug = (name) =>
  name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'trip';
