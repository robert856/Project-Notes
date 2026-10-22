import { it, expect } from "vitest";
import { droppedUrl, youtubeId, acceptedDropEffect } from "./drops";
it("reads URI lists and plain links and rejects executable URLs", () => {
  expect(droppedUrl("# comment\nhttps://example.com/", "", "")).toBe(
    "https://example.com/",
  );
  expect(droppedUrl("", "https://youtu.be/dQw4w9WgXcQ", "")).toBe(
    "https://youtu.be/dQw4w9WgXcQ",
  );
  expect(droppedUrl("javascript:alert(1)", "not a link", "")).toBeNull();
});
it("only embeds validated YouTube hosts and video IDs", () => {
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=20",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
  ])
    expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
  for (const url of [
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/invalid",
    "javascript:alert(1)",
  ])
    expect(youtubeId(url)).toBeNull();
});

it("accepts address-bar links even when their source does not permit copying", () => {
  expect(acceptedDropEffect("link")).toBe("link");
  expect(acceptedDropEffect("linkMove")).toBe("link");
  expect(acceptedDropEffect("copyLink")).toBe("copy");
  expect(acceptedDropEffect("all")).toBe("copy");
});
