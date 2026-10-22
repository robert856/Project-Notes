import { test, expect } from "@playwright/test";
test("create, edit, resize, move, persist and delete a card", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The story room" }),
  ).toBeVisible();
  await page.getByTitle("Add text", { exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A test idea");
  await page
    .getByLabel("Content · Markdown formatting supported")
    .fill("A **bright** idea for the forest.");
  await page.getByRole("button", { name: "Save changes" }).click();
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "A test idea" });
  await expect(node.locator("strong")).toHaveText("bright");
  const before = await node.boundingBox();
  if (!before) throw Error("Missing card");
  await node.locator("h3").hover();
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 110, { steps: 10 });
  await page.mouse.up();
  const moved = await node.boundingBox();
  expect(moved?.x).not.toBe(before.x);
  await node.click();
  const handle = node.locator(
    ".react-flow__resize-control.bottom.right.handle",
  );
  await expect(handle).toBeVisible();
  const rect = await handle.boundingBox();
  if (!rect) throw Error("Missing resize handle");
  await page.mouse.move(rect.x + 2, rect.y + 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 60, rect.y + 55, { steps: 10 });
  await page.mouse.up();
  await page.reload();
  const saved = page
    .locator(".react-flow__node")
    .filter({ hasText: "A test idea" });
  await expect(saved).toBeVisible();
  expect((await saved.boundingBox())!.width).toBeGreaterThan(before.width);
  await saved.dblclick();
  page.once("dialog", (d) => d.accept());
  await page.getByTitle("Delete card", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "A test idea" })).toHaveCount(
    0,
  );
});
test("dashboard, search and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: /All projects/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your creative space" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search boards and cards" })
    .fill("creatures");
  await expect(page.locator(".board-tile")).toHaveCount(1);
});

test("drops YouTube links and local files onto the canvas and preserves them", async ({
  page,
}) => {
  await page.goto("/");
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData("text/uri-list", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    return d;
  });
  await page.locator(".react-flow__pane").dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: 700,
    clientY: 450,
  });
  const video = page
    .locator(".react-flow__node")
    .filter({ hasText: "YouTube video" });
  await expect(video).toBeVisible();
  await expect(video.locator("iframe")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  const files = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(["a little inspiration"], "ideas.txt", { type: "text/plain" }),
    );
    return d;
  });
  await page
    .locator(".react-flow__pane")
    .dispatchEvent("drop", { dataTransfer: files, clientX: 800, clientY: 600 });
  const file = page
    .locator(".react-flow__node")
    .filter({ hasText: "ideas.txt" });
  await expect(file).toBeVisible();
  await page.reload();
  await expect(file).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    file.getByRole("button", { name: "Download attachment" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("ideas.txt");
  expect(
    await page.evaluate(async () => {
      return await new Promise((resolve) => {
        const r = indexedDB.open("stillroom-files", 1);
        r.onsuccess = () => {
          const tx = r.result.transaction("files");
          const get = tx.objectStore("files").getAll();
          get.onsuccess = async () => {
            resolve(await get.result[0].text());
            r.result.close();
          };
        };
      });
    }),
  ).toBe("a little inspiration");
});

test("box-selects cards, moves the selection, aligns and preserves positions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("selection-test")) {
      localStorage.setItem("selection-test", "yes");
      localStorage.setItem(
        "stillroom-cards",
        JSON.stringify([
          {
            id: "one",
            board_id: "20000000-0000-4000-8000-000000000001",
            title: "First idea",
            content: "One",
            kind: "text",
            x: 40,
            y: 40,
            width: 240,
            height: 180,
            version: 1,
            color: "white",
          },
          {
            id: "two",
            board_id: "20000000-0000-4000-8000-000000000001",
            title: "Second idea",
            content: "Two",
            kind: "text",
            x: 400,
            y: 70,
            width: 280,
            height: 200,
            version: 1,
            color: "white",
          },
          {
            id: "three",
            board_id: "20000000-0000-4000-8000-000000000001",
            title: "Third idea",
            content: "Three",
            kind: "text",
            x: 750,
            y: 400,
            width: 240,
            height: 180,
            version: 1,
            color: "white",
          },
        ]),
      );
    }
  });
  await page.goto("/");
  const canvas = await page.locator(".canvas-wrap").boundingBox();
  if (!canvas) throw Error("Canvas missing");
  await page.mouse.move(canvas.x + 10, canvas.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 650, canvas.y + 300, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  const first = page
    .locator(".react-flow__node")
    .filter({ hasText: "First idea" });
  const rect = await first.boundingBox();
  if (!rect) throw Error("Card missing");
  await page.mouse.move(rect.x + 50, rect.y + 60);
  await page.mouse.down();
  await page.mouse.move(rect.x + 90, rect.y + 100, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("stillroom-cards") || "[]")
          .filter((c: { id: string; x: number }) =>
            ["one", "two"].includes(c.id),
          )
          .map((c: { x: number }) => Math.round(c.x)),
      ),
    )
    .toEqual([expect.any(Number), expect.any(Number)]);
  const moved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stillroom-cards") || "[]"),
  );
  expect(moved[0].x).toBeGreaterThan(65);
  expect(moved[1].x - moved[0].x).toBeCloseTo(360);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await page.getByRole("button", { name: "Align top", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const cards = JSON.parse(
          localStorage.getItem("stillroom-cards") || "[]",
        );
        return cards[0].y === cards[1].y;
      }),
    )
    .toBe(true);
  await page.reload();
  const positions = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stillroom-cards") || "[]"),
  );
  expect(positions[0].y).toBe(positions[1].y);
  expect(positions[2].x).toBe(750);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(3);
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Set(
            JSON.parse(localStorage.getItem("stillroom-cards") || "[]").map(
              (c: { x: number }) => c.x,
            ),
          ).size,
      ),
    )
    .toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  await page.keyboard.press("Control+a");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(3);
});
