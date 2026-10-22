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
  await page.getByTitle("Delete note", { exact: true }).click();
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
  await page
    .getByRole("button", { name: "Align and distribute", exact: true })
    .click();
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
  if (
    !(await page
      .getByRole("button", { name: "Select all", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Align and distribute", exact: true })
      .click();
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

test("PDF drop is captured over cards, survives refresh, and preserves its bytes", async ({
  page,
}) => {
  await page.goto("/");
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
  await expect(page.getByText("Drop it here", { exact: true })).toBeVisible();
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
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
  if (
    !(await page
      .getByRole("button", { name: "Select all", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Align and distribute", exact: true })
      .click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
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
  await page
    .getByRole("button", { name: "Distribute vertically", exact: true })
    .click();
  await expect.poll(() => equalGaps("y")).toBe(true);
  await page.reload();
  expect(await equalGaps("x")).toBe(true);
  expect(await equalGaps("y")).toBe(true);
});

test("canvas project tiles can move, open boards, and retain their layout", async ({
  page,
}) => {
  await page.goto("/");
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
  await page.goto("/");
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
  await expect(text).toBeVisible();
});

test("Undo reverses a saved edit while typing keeps native text undo and deletion", async ({
  page,
}) => {
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
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
