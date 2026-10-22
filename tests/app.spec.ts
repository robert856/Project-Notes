import { test, expect, type Page } from "@playwright/test";

async function openDefaultNote(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Select True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .dblclick();
  await page.locator(".explorer-open").first().dblclick();
}
async function openStoryRoom(page: Page) {
  await page.goto("/");
  await openDefaultNote(page);
}

async function openArrange(page: Page) {
  if (
    !(await page
      .getByRole("toolbar", {
        name: "Selection, alignment and distribution",
        exact: true,
      })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Align and distribute", exact: true })
      .click();
}
test("create, edit, resize, move, persist and delete a card", async ({
  page,
}) => {
  await openStoryRoom(page);
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
  await openDefaultNote(page);
  const saved = page
    .locator(".react-flow__node")
    .filter({ hasText: "A test idea" });
  await expect(saved).toBeVisible();
  expect((await saved.boundingBox())!.width).toBeGreaterThan(before.width);
  await saved.dblclick();
  await page.getByTitle("Delete note", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "A test idea" })).toHaveCount(
    0,
  );
});
test("dashboard, search and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStoryRoom(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: /All projects/ }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Select True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .dblclick();
  await page.getByRole("textbox", { name: "Search notes" }).fill("creatures");
  await expect(page.locator(".explorer-tile")).toHaveCount(1);
});

test("drops YouTube links and local files onto the canvas and preserves them", async ({
  page,
}) => {
  await openStoryRoom(page);
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
  await openDefaultNote(page);
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
  await openStoryRoom(page);
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
  await page
    .getByRole("button", { name: "Align and distribute", exact: true })
    .click();
  await openArrange(page);
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
  await openDefaultNote(page);
  const positions = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stillroom-cards") || "[]"),
  );
  expect(positions[0].y).toBe(positions[1].y);
  expect(positions[2].x).toBe(750);
  if (
    !(await page
      .getByRole("button", { name: "Select all", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Align and distribute", exact: true })
      .click();
  await openArrange(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(3);
  await openArrange(page);
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

test("PDF drop is captured over cards, survives refresh, and preserves its bytes", async ({
  page,
}) => {
  await openStoryRoom(page);
  await page.getByRole("textbox", { name: "Search notes" }).fill("Addison");
  const target = page.locator(".canvas-card").first();
  await expect(target).toBeVisible();
  // A child handler must not be able to swallow the outer canvas drop.
  await target.evaluate((el) =>
    el.addEventListener("drop", (event) => event.stopPropagation()),
  );
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(
        ["%PDF-1.4\nCreative project notes\n%%EOF"],
        "project-notes.pdf",
        { type: "application/pdf" },
      ),
    );
    return d;
  });
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.getByText("Drop it here", { exact: true })).toHaveCount(0);
  await target.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: 750,
    clientY: 500,
  });
  const card = page
    .locator(".react-flow__node")
    .filter({ hasText: "project-notes.pdf" });
  await expect(card).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveValue(
    "",
  );
  await page.reload();
  await openDefaultNote(page);
  await expect(card).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: "Download attachment" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("project-notes.pdf");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(
    "%PDF-1.4\nCreative project notes\n%%EOF",
  );
});

test("oversized file rejection is visible and does not create a card", async ({
  page,
}) => {
  await openStoryRoom(page);
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], "too-large.pdf", {
        type: "application/pdf",
      }),
    );
    return d;
  });
  await page.locator(".react-flow__pane").dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: 700,
    clientY: 450,
  });
  await expect(page.getByRole("status")).toContainText(
    "too-large.pdf exceeds the 20 MB file limit",
  );
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "too-large.pdf" }),
  ).toHaveCount(0);
});

test("native file drops outside the canvas cannot replace the page", async ({
  page,
}) => {
  await openStoryRoom(page);
  for (const selector of ["header", ".tool-rail", ".sidebar"]) {
    const prevented = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File(["image bytes"], "test.png", { type: "image/png" }),
        );
        element.addEventListener("drop", (event) => event.stopPropagation(), {
          once: true,
        });
        const over = new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        });
        element.dispatchEvent(over);
        const drop = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        });
        element.dispatchEvent(drop);
        return { over: over.defaultPrevented, drop: drop.defaultPrevented };
      });
    expect(prevented).toEqual({ over: true, drop: true });
    await expect(page.getByRole("status")).toContainText(
      "Drop inside the note canvas",
    );
    expect(new URL(page.url()).pathname).toBe("/");
  }
  // The guard must not suppress the intended canvas upload.
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(["image bytes"], "canvas-image.png", { type: "image/png" }),
    );
    return d;
  });
  await page.locator(".react-flow__pane").dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: 700,
    clientY: 450,
  });
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "canvas-image.png" }),
  ).toBeVisible();
});

test("distributes cards in both directions and saves the spacing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openStoryRoom(page);
  if (
    !(await page
      .getByRole("button", { name: "Select all", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Align and distribute", exact: true })
      .click();
  await openArrange(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await openArrange(page);
  await page
    .getByRole("button", { name: "Distribute horizontally", exact: true })
    .click();
  const equalGaps = async (axis: "x" | "y") =>
    page.evaluate((axis) => {
      const cards = JSON.parse(
        localStorage.getItem("stillroom-cards") || "[]",
      ).sort(
        (a: Record<string, number>, b: Record<string, number>) =>
          a[axis] - b[axis],
      );
      const size = axis === "x" ? "width" : "height";
      const gaps = cards
        .slice(1)
        .map(
          (c: Record<string, number>, i: number) =>
            c[axis] - cards[i][axis] - cards[i][size],
        );
      return (
        gaps.length > 1 &&
        gaps.every((g: number) => Math.abs(g - gaps[0]) < 0.001)
      );
    }, axis);
  await expect.poll(() => equalGaps("x")).toBe(true);
  await openArrange(page);
  await page
    .getByRole("button", { name: "Distribute vertically", exact: true })
    .click();
  await expect.poll(() => equalGaps("y")).toBe(true);
  await page.reload();
  await openDefaultNote(page);
  expect(await equalGaps("x")).toBe(true);
  expect(await equalGaps("y")).toBe(true);
});

test("canvas project tiles can move, open boards, and retain their layout", async ({
  page,
}) => {
  await openStoryRoom(page);
  const home = page
    .getByRole("navigation", { name: "Canvas tools" })
    .getByRole("button", { name: "Home", exact: true });
  await home.click();
  const project = page
    .locator(".react-flow__node")
    .filter({ hasText: "True Myth: Addison’s Midnight Walk" });
  await expect(project).toBeVisible();
  const box = await project.locator(".explorer-open").boundingBox();
  if (!box) throw Error("Missing project tile");
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 90, { steps: 15 });
  await page.mouse.up();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(
            JSON.parse(localStorage.getItem("stillroom-layout:home") || "{}"),
          ).length,
      ),
    )
    .toBe(1);
  const layout = await page.evaluate(() =>
    localStorage.getItem("stillroom-layout:home"),
  );
  await page.reload();
  await openDefaultNote(page);
  await home.click();
  expect(
    await page.evaluate(() => localStorage.getItem("stillroom-layout:home")),
  ).toBe(layout);
  await project
    .getByRole("button", {
      name: "Select True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .dblclick();
  await expect(page.locator(".explorer-tile")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Select The story room", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "The story room", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-card")).toHaveCount(8);
});

test("single-click selects projects and notes; Delete is immediate and Undo restores them", async ({
  page,
}) => {
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs++;
    void d.dismiss();
  });
  await openStoryRoom(page);
  const home = page
    .getByRole("navigation", { name: "Canvas tools" })
    .getByRole("button", { name: "Home", exact: true });
  await home.click();
  const project = page.getByRole("button", {
    name: "Select True Myth: Addison’s Midnight Walk",
    exact: true,
  });
  await project.click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(project).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Control+z");
  await expect(project).toBeVisible();
  await project.dblclick();
  const note = page.getByRole("button", {
    name: "Select The story room",
    exact: true,
  });
  await note.click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(note).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(note).toBeVisible();
  await note.dblclick();
  const text = page
    .locator(".react-flow__node")
    .filter({ hasText: "What if the forest remembered?" });
  await text.locator("h3").click();
  await expect(text).toHaveClass(/selected/);
  await page.keyboard.press("Delete");
  await expect(text).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(text).toBeVisible();
  expect(dialogs).toBe(0);
  await page.reload();
  await openDefaultNote(page);
  await expect(text).toBeVisible();
});

test("Undo reverses a saved edit while typing keeps native text undo and deletion", async ({
  page,
}) => {
  await openStoryRoom(page);
  const note = page
    .locator(".react-flow__node")
    .filter({ hasText: "What if the forest remembered?" });
  await note.dblclick();
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("Changed title");
  await title.press("End");
  await title.press("Backspace");
  await expect(title).toHaveValue("Changed titl");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Changed titl", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "What if the forest remembered?",
      exact: true,
    }),
  ).toBeVisible();
});

test("multi-note deletion is immediate, restores in one undo, and supports consecutive undos", async ({
  page,
}) => {
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs++;
    void d.dismiss();
  });
  await openStoryRoom(page);
  await expect(page.locator(".canvas-card")).toHaveCount(8);
  await page.keyboard.press("Control+a");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(8);
  await page.keyboard.press("Delete");
  await expect(page.locator(".canvas-card")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".canvas-card")).toHaveCount(8);
  const first = page
    .locator(".react-flow__node")
    .filter({ hasText: "What if the forest remembered?" });
  await first.locator("h3").click();
  await page.keyboard.press("Delete");
  await expect(first).toHaveCount(0);
  const second = page
    .locator(".react-flow__node")
    .filter({ hasText: "Keep this feeling" });
  await second.locator("h3").click();
  await page.keyboard.press("Delete");
  await expect(second).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(first).toBeVisible();
  expect(dialogs).toBe(0);
});

test("Undo restores a moved project tile to its original position", async ({
  page,
}) => {
  await openStoryRoom(page);
  await page
    .getByRole("navigation", { name: "Canvas tools" })
    .getByRole("button", { name: "Home", exact: true })
    .click();
  const tile = page.locator(".explorer-open").first();
  const before = await tile.boundingBox();
  if (!before) throw Error("Missing tile");
  await page.mouse.move(before.x + 25, before.y + 25);
  await page.mouse.down();
  await page.mouse.move(before.x + 125, before.y + 85, { steps: 10 });
  await page.mouse.up();
  expect((await tile.boundingBox())!.x).toBeGreaterThan(before.x + 50);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => Math.round((await tile.boundingBox())!.x))
    .toBe(Math.round(before.x));
});

test("project canvas accepts a native URL drag and files directly beside note tiles", async ({
  page,
}) => {
  await openStoryRoom(page);
  const openProject = () =>
    page
      .getByRole("main")
      .getByRole("button", {
        name: "True Myth: Addison’s Midnight Walk",
        exact: true,
      })
      .click();
  await openProject();
  await expect(page.locator(".explorer-tile")).toHaveCount(3);
  await expect(page.getByTitle("Add text", { exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.id = "url-drag";
    a.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    a.textContent = "YouTube URL";
    a.style.cssText =
      "position:fixed;top:5px;left:500px;z-index:100;background:white;padding:8px";
    a.addEventListener("dragstart", (event) => {
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "link";
    });
    document.body.append(a);
  });
  await page.locator("#url-drag").dragTo(page.locator(".explorer-canvas"), {
    targetPosition: { x: 550, y: 320 },
  });
  const video = page
    .locator(".react-flow__node")
    .filter({ hasText: "YouTube video" });
  await expect(video).toBeVisible();
  await expect(video.locator("iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie.com\/embed\/dQw4w9WgXcQ/,
  );
  expect(new URL(page.url()).pathname).toBe("/");
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(["png test bytes"], "direct-image.png", { type: "image/png" }),
    );
    return d;
  });
  await page.locator(".explorer-canvas").dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: 950,
    clientY: 500,
  });
  const image = page
    .locator(".react-flow__node")
    .filter({ hasText: "direct-image.png" });
  await expect(image).toBeVisible();
  await expect(page.locator(".explorer-tile")).toHaveCount(3);
  await page.reload();
  await openDefaultNote(page);
  await openProject();
  await expect(image).toBeVisible();
  await expect(video).toBeVisible();
  await page.keyboard.press("Control+a");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Align and distribute", exact: true })
    .click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(5);
  await openArrange(page);
  await expect(
    page.getByRole("button", { name: "Distribute horizontally", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Align and distribute", exact: true })
    .click();
  await video.getByRole("heading").click();
  await image.getByRole("heading").click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Align and distribute", exact: true })
    .click();
  await openArrange(page);
  await expect(
    page.getByRole("button", { name: "Align left", exact: true }),
  ).toBeEnabled();
  await openArrange(page);
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const notes = JSON.parse(
          localStorage.getItem("stillroom-cards") || "[]",
        ).filter((c: { title: string }) =>
          ["YouTube video", "direct-image.png"].includes(c.title),
        );
        return notes.length === 2 && notes[0].x === notes[1].x;
      }),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await image.getByRole("heading").click();
  await page.keyboard.press("Delete");
  await expect(image).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(image).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    image.getByRole("button", { name: "Download attachment" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("direct-image.png");
});

test("alignment and distribution stay available for Home projects and project note tiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("arrange-level-test")) {
      localStorage.setItem("arrange-level-test", "1");
      localStorage.setItem(
        "stillroom-projects",
        JSON.stringify([
          {
            id: "10000000-0000-4000-8000-000000000001",
            title: "True Myth: Addison’s Midnight Walk",
          },
          { id: "second", title: "Second project" },
          { id: "third", title: "Third project" },
        ]),
      );
      localStorage.setItem(
        "stillroom-layout:home",
        JSON.stringify({
          "10000000-0000-4000-8000-000000000001": { x: 100, y: 60 },
          second: { x: 400, y: 130 },
          third: { x: 800, y: 250 },
        }),
      );
    }
  });
  await openStoryRoom(page);
  const home = page
    .getByRole("navigation", { name: "Canvas tools" })
    .getByRole("button", { name: "Home", exact: true });
  await home.click();
  await expect(page.locator(".explorer-tile")).toHaveCount(3);
  const arrange = page.getByRole("button", {
    name: "Align and distribute",
    exact: true,
  });
  await expect(arrange).toBeEnabled();
  await arrange.click();
  await openArrange(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await openArrange(page);
  await expect(
    page.getByRole("button", { name: "Align top", exact: true }),
  ).toBeEnabled();
  await openArrange(page);
  await page.getByRole("button", { name: "Align top", exact: true }).click();
  const tops = await page
    .locator(".react-flow__node.selected")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
  await openArrange(page);
  await page
    .getByRole("button", { name: "Distribute horizontally", exact: true })
    .click();
  const layout = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stillroom-layout:home") || "{}"),
  );
  const xs = Object.values(layout)
    .map((v) => (v as { x: number }).x)
    .sort((a, b) => a - b);
  expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1]);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Select True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .dblclick();
  await openArrange(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(3);
  await openArrange(page);
  await expect(
    page.getByRole("button", { name: "Distribute vertically", exact: true }),
  ).toBeEnabled();
  await openArrange(page);
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  const lefts = await page
    .locator(".react-flow__node.selected")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().left));
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(1);
  await openArrange(page);
  await page
    .getByRole("button", { name: "Distribute vertically", exact: true })
    .click();
  const noteLayout = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        "stillroom-layout:10000000-0000-4000-8000-000000000001",
      ) || "{}",
    ),
  );
  expect(Object.keys(noteLayout)).toHaveLength(3);
  await page.reload();
  await openDefaultNote(page);
  await home.click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("stillroom-layout:home") || "{}"),
    ),
  ).toEqual(layout);
});

test("Arrange dismisses after actions, outside click, Escape, navigation and window blur", async ({
  page,
}) => {
  await openStoryRoom(page);
  await expect(page.locator(".canvas-card")).toHaveCount(8);
  const panel = page.getByRole("toolbar", {
    name: "Selection, alignment and distribution",
    exact: true,
  });
  const trigger = page.getByRole("button", {
    name: "Align and distribute",
    exact: true,
  });
  await openArrange(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await openArrange(page);
  await page
    .getByRole("button", { name: "Distribute vertically", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await openArrange(page);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await openArrange(page);
  await page
    .getByRole("heading", { name: "The story room", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await openArrange(page);
  await trigger.click();
  await expect(panel).toBeHidden();
  await openArrange(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(panel).toBeHidden();
  await openArrange(page);
  await page
    .getByRole("navigation", { name: "Canvas tools" })
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await openArrange(page);
  await page
    .getByRole("button", {
      name: "Select True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .dblclick();
  await expect(panel).toBeHidden();
  await openArrange(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(panel).toBeHidden();
});

test("drags the left Note tool onto an opened canvas and a project canvas", async ({
  page,
}) => {
  await openStoryRoom(page);
  await expect(page.locator(".canvas-card")).toHaveCount(8);
  const tool = page.getByTitle("Add text", { exact: true });
  const canvas = page.locator(".canvas-wrap");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw Error("Missing canvas");
  await tool.dragTo(canvas, { targetPosition: { x: 500, y: 300 } });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Untitled note",
  );
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  const note = page
    .locator(".react-flow__node")
    .filter({ hasText: "Untitled note" });
  await expect(note).toBeVisible();
  const position = await note.boundingBox();
  expect(position!.x).toBeCloseTo(bounds.x + 500, 0);
  expect(position!.y).toBeCloseTo(bounds.y + 300, 0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("stillroom-cards") || "[]").filter(
          (n: { title: string }) => n.title === "Untitled note",
        ).length,
    ),
  ).toBe(1);
  await page
    .getByRole("main")
    .getByRole("button", {
      name: "True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .click();
  await tool.dragTo(page.locator(".explorer-canvas"), {
    targetPosition: { x: 650, y: 350 },
  });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Untitled note",
  );
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(
    page.locator(".canvas-card").filter({ hasText: "Untitled note" }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("stillroom-cards") || "[]").filter(
          (n: { title: string }) => n.title === "Untitled note",
        ).length,
    ),
  ).toBe(2);
});

test("renames a board by clicking its title, saves on Enter or blur, and cancels on Escape", async ({
  page,
}) => {
  await openStoryRoom(page);
  const openProject = () =>
    page
      .getByRole("main")
      .getByRole("button", {
        name: "True Myth: Addison’s Midnight Walk",
        exact: true,
      })
      .click();
  await openProject();
  await page
    .getByRole("button", { name: "Rename The story room", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Note title", exact: true });
  await expect(input).toBeFocused();
  await input.fill("Research board");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Rename Research board", exact: true }),
  ).toBeVisible();
  await expect(input).toHaveCount(0);
  await page.reload();
  await openDefaultNote(page);
  await openProject();
  await page
    .getByRole("button", { name: "Rename Research board", exact: true })
    .click();
  await input.fill("Do not save");
  await input.press("Escape");
  await expect(
    page.getByRole("button", { name: "Rename Research board", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rename Research board", exact: true })
    .click();
  await input.fill("Visual research");
  await page
    .getByRole("heading", {
      name: "True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Rename Visual research", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", { name: "Rename Research board", exact: true }),
  ).toBeVisible();
});

test("always starts on Home on first visit and after refreshing without losing notes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await openDefaultNote(page);
  await page.getByTitle("Add text", { exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Keep my note");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep my note", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-card")).toHaveCount(0);
  await openDefaultNote(page);
  await expect(
    page.getByRole("heading", { name: "Keep my note", exact: true }),
  ).toBeVisible();
});

test("Home project titles rename inline, persist and support cancel and Undo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Rename True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .click();
  const title = page.getByRole("textbox", {
    name: "Project title",
    exact: true,
  });
  await expect(title).toBeFocused();
  await title.fill("My creative projects");
  await title.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Rename My creative projects",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Rename My creative projects", exact: true })
    .click();
  await title.fill("Cancel this");
  await title.press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Rename My creative projects",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rename My creative projects", exact: true })
    .click();
  await title.fill("A new title");
  await page.getByRole("heading", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rename A new title", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", {
      name: "Rename My creative projects",
      exact: true,
    }),
  ).toBeVisible();
});

test("drags both Note and Board tools directly onto Home without opening a project", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  const canvas = page.locator(".explorer-canvas");
  const noteTool = page.getByTitle("Add text", { exact: true });
  await expect(noteTool).toBeEnabled();
  await noteTool.dragTo(canvas, { targetPosition: { x: 500, y: 250 } });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Untitled note",
  );
  await page.getByLabel("Title", { exact: true }).fill("Home note");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home note", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  const boardTool = page.getByRole("button", {
    name: "Add board",
    exact: true,
  });
  await expect(boardTool).toHaveAttribute("draggable", "true");
  await boardTool.dragTo(canvas, { targetPosition: { x: 850, y: 350 } });
  await expect(
    page.getByRole("button", { name: "Select Untitled board", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Home note", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select Untitled board", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select Untitled board", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Untitled board", exact: true }),
  ).toBeVisible();
});

test("drags a Board tool onto a project canvas at the drop location", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Select True Myth: Addison’s Midnight Walk",
      exact: true,
    })
    .dblclick();
  const canvas = page.locator(".explorer-canvas");
  const rect = await canvas.boundingBox();
  if (!rect) throw Error("Missing canvas");
  await page
    .getByRole("button", { name: "Add board", exact: true })
    .dragTo(canvas, { targetPosition: { x: 700, y: 360 } });
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "Untitled board" });
  await expect(node).toBeVisible();
  const placed = await node.boundingBox();
  expect(placed!.x).toBeCloseTo(rect.x + 700, 0);
  expect(placed!.y).toBeCloseTo(rect.y + 360, 0);
  await expect(
    page.getByRole("heading", {
      name: "True Myth: Addison’s Midnight Walk",
      exact: true,
    }),
  ).toBeVisible();
});

test("canvas stays visually unchanged while a toolbar board is dragged across it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".explorer-tile")).toHaveCount(1);
  const canvas = page.locator(".explorer-canvas");
  const before = await canvas.evaluate((el) => ({
    text: el.textContent,
    classes: el.className,
    bounds: JSON.stringify(el.getBoundingClientRect().toJSON()),
  }));
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData("application/x-stillroom-tool", "board");
    d.effectAllowed = "copy";
    return d;
  });
  for (let i = 0; i < 6; i++) {
    const target = i % 2 ? canvas : page.locator(".explorer-open").first();
    await target.dispatchEvent("dragenter", {
      dataTransfer: transfer,
      clientX: 500 + i * 10,
      clientY: 350,
    });
    await target.dispatchEvent("dragover", {
      dataTransfer: transfer,
      clientX: 500 + i * 10,
      clientY: 350,
    });
    await target.dispatchEvent("dragleave", {
      dataTransfer: transfer,
      clientX: 510 + i * 10,
      clientY: 350,
    });
  }
  const during = await canvas.evaluate((el) => ({
    text: el.textContent,
    classes: el.className,
    bounds: JSON.stringify(el.getBoundingClientRect().toJSON()),
  }));
  expect(during).toEqual(before);
  await expect(page.locator(".drop-overlay")).toHaveCount(0);
  await expect(page.getByText("Drop it here", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("canvas-dragging"),
    ),
  ).toBe(true);
  await canvas.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: 800,
    clientY: 450,
  });
  await expect(
    page.getByRole("button", { name: "Select Untitled board", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("canvas-dragging"),
    ),
  ).toBe(false);
});
