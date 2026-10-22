import { safeUrl } from "./model";

export function droppedUrl(
  uriList: string,
  text: string,
  html: string,
): string | null {
  const candidates = [
    ...uriList.split(/\r?\n/).filter((line) => !line.startsWith("#")),
    text.trim(),
  ];
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    candidates.push(doc.querySelector("a")?.getAttribute("href") || "");
  }
  for (const candidate of candidates) {
    const url = safeUrl(candidate.trim());
    if (url) return url;
  }
  return null;
}

export function youtubeId(value: string): string | null {
  const safe = safeUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  if (host === "youtube.com" || host === "m.youtube.com") {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : /^\/(shorts|embed|live)\//.test(url.pathname)
          ? url.pathname.split("/")[2]
          : null;
  }
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

// Browser-local binary storage; never embed file contents in the card JSON.
function localFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("stillroom-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Browser file storage is unavailable."));
  });
}
export async function storeLocalFile(key: string, file: File): Promise<void> {
  const db = await localFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(file, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error("Could not store this file. Browser storage may be full."),
        );
      tx.onabort = () => reject(new Error("File storage was interrupted."));
    });
  } finally {
    db.close();
  }
}
export async function readLocalFile(key: string): Promise<Blob> {
  const db = await localFiles();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(key);
      request.onsuccess = () =>
        request.result
          ? resolve(request.result)
          : reject(new Error("This file is no longer stored in this browser."));
      request.onerror = () =>
        reject(new Error("Could not read the stored file."));
    });
  } finally {
    db.close();
  }
}
