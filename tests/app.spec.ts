import { test, expect, type Page } from "@playwright/test";
const openButton = (page: Page, title: string) =>
  page.getByRole("button", { name: `Open ${title}`, exact: true });
const node = (page: Page, title: string) =>
  openButton(page, title).locator(
    'xpath=ancestor::*[contains(@class,"react-flow__node")][1]',
  );
async function make(page: Page, title: string) {
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page
    .getByRole("button", { name: "Rename Untitled page", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Page title", exact: true });
  await input.fill(title);
  await input.press("Enter");
  await expect(openButton(page, title)).toBeVisible();
}
async function open(page: Page, title: string) {
  await openButton(page, title).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
async function home(page: Page) {
  await page
    .getByRole("navigation", { name: "Page tools" })
    .getByRole("button", { name: "Home", exact: true })
    .click();
}
async function drag(
  page: Page,
  title: string,
  target: { x: number; y: number },
) {
  const source = (await node(page, title).boundingBox())!;
  await page.mouse.move(source.x + 30, source.y + 30);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 20 });
}
test("migrates browser content to pages, preserves originals and always starts at Home", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    openButton(page, "True Myth: Addison’s Midnight Walk"),
  ).toBeVisible();
  await open(page, "True Myth: Addison’s Midnight Walk");
  await open(page, "The story room");
  await expect(openButton(page, "Addison")).toBeVisible();
  await open(page, "Addison");
  await expect(page.locator(".page-own-content")).toContainText("Curious");
  await expect(page.locator(".breadcrumbs")).toContainText("The story room");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});
test("creates four nested levels and every page can contain content and more pages", async ({
  page,
}) => {
  await page.goto("/");
  for (const title of ["Writing", "True Myth", "Characters", "Addison"]) {
    await make(page, title);
    await open(page, title);
  }
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page content" })
    .fill("A **brave** character");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".page-own-content strong")).toHaveText("brave");
  await make(page, "Reference images");
  await expect(page.locator(".breadcrumbs")).toContainText("Writing");
  await expect(page.locator(".breadcrumbs")).toContainText("Addison");
  await page.reload();
  await open(page, "Writing");
  await open(page, "True Myth");
  await open(page, "Characters");
  await open(page, "Addison");
  await expect(openButton(page, "Reference images")).toBeVisible();
});
test("breadcrumb highlights are previews until release; pulling back leaves the page on its canvas", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Root");
  await open(page, "Root");
  await make(page, "Branch");
  await open(page, "Branch");
  await make(page, "Leaf");
  const crumb = page
      .locator(".breadcrumbs")
      .getByRole("button", { name: "Root", exact: true }),
    box = (await crumb.boundingBox())!;
  const source = (await node(page, "Leaf").boundingBox())!;
  await drag(page, "Leaf", {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  await expect(crumb).toHaveClass(/crumb-landing/);
  expect(
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("stillroom-pages:v1")!);
      return (
        p.find((v: { title: string }) => v.title === "Leaf").parent_id ===
        p.find((v: { title: string }) => v.title === "Branch").id
      );
    }),
  ).toBe(true);
  await page.mouse.move(source.x + 30, source.y + 30, { steps: 15 });
  await expect(crumb).not.toHaveClass(/crumb-landing/);
  await page.mouse.up();
  await expect(openButton(page, "Leaf")).toBeVisible();
  await drag(page, "Leaf", {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  await page.mouse.up();
  await expect(openButton(page, "Leaf")).toHaveCount(0);
  await crumb.click();
  await expect(openButton(page, "Leaf")).toBeVisible();
});
test("moves any page onto another page and Undo restores the whole subtree", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Destination");
  await make(page, "Source");
  await open(page, "Source");
  await make(page, "Child");
  await home(page);
  const target = (await node(page, "Destination").boundingBox())!;
  await drag(page, "Source", {
    x: target.x + target.width / 2,
    y: target.y + 40,
  });
  await expect(node(page, "Destination")).toHaveClass(/page-landing/);
  await page.mouse.up();
  await expect(openButton(page, "Source")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(openButton(page, "Source")).toBeVisible();
  await open(page, "Source");
  await expect(openButton(page, "Child")).toBeVisible();
});
test("moves a nested page to Home through breadcrumbs and persists its children", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Parent");
  await open(page, "Parent");
  await make(page, "Moving");
  await open(page, "Moving");
  await make(page, "Nested");
  await page
    .locator(".breadcrumbs")
    .getByRole("button", { name: "Parent", exact: true })
    .click();
  const crumb = page
      .locator(".breadcrumbs")
      .getByRole("button", { name: "Home", exact: true }),
    target = (await crumb.boundingBox())!;
  await drag(page, "Moving", {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  });
  await page.mouse.up();
  await expect(openButton(page, "Moving")).toHaveCount(0);
  await page.reload();
  await open(page, "Moving");
  await expect(openButton(page, "Nested")).toBeVisible();
});
test("Move to searches other branches and excludes descendants", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "A");
  await open(page, "A");
  await make(page, "B");
  await home(page);
  await make(page, "Other branch");
  await node(page, "A").click({ position: { x: 12, y: 12 } });
  await page
    .getByRole("button", { name: "Move selected page", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Move page" });
  await expect(
    dialog.getByRole("button", { name: "A / B", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Find destination" }).fill("Other");
  await dialog
    .getByRole("button", { name: "Other branch", exact: true })
    .click();
  await expect(openButton(page, "A")).toHaveCount(0);
  await open(page, "Other branch");
  await open(page, "A");
  await expect(openButton(page, "B")).toBeVisible();
});
test("deletes a page immediately, Undo restores children, and consecutive edits undo safely", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Delete me");
  await open(page, "Delete me");
  await make(page, "Kept child");
  await home(page);
  await node(page, "Delete me").click({ position: { x: 12, y: 12 } });
  await page.keyboard.press("Delete");
  await expect(openButton(page, "Delete me")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(openButton(page, "Delete me")).toBeVisible();
  await open(page, "Delete me");
  await expect(openButton(page, "Kept child")).toBeVisible();
  await page
    .getByRole("button", { name: "Rename Kept child", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Page title", exact: true });
  await input.fill("First edit");
  await input.press("Enter");
  await expect(openButton(page, "First edit")).toBeVisible();
  await page
    .getByRole("button", { name: "Rename First edit", exact: true })
    .click();
  await input.fill("Second edit");
  await input.press("Enter");
  await expect(openButton(page, "Second edit")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(openButton(page, "First edit")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(openButton(page, "Kept child")).toBeVisible();
});
test("creates text, links, images and checklists as pages with nested children", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("Text page");
  await page
    .getByRole("textbox", { name: "Page content" })
    .fill("**Important** idea");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(node(page, "Text page").locator("strong")).toHaveText(
    "Important",
  );
  await open(page, "Text page");
  await make(page, "Child page");
  await home(page);
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  await expect(page.getByRole("form", { name: "Edit page" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rename Untitled page", exact: true })
    .click();
  const title = page.getByRole("textbox", { name: "Page title", exact: true });
  await title.fill("Tasks");
  await title.press("Enter");
  const tasks = node(page, "Tasks");
  await tasks
    .getByRole("textbox", { name: "New to-do", exact: true })
    .fill("First task");
  await tasks
    .getByRole("textbox", { name: "New to-do", exact: true })
    .press("Enter");
  await tasks.getByRole("checkbox").first().check();
  await expect(tasks.getByRole("checkbox").first()).toBeChecked();
});
test("drops YouTube URLs and local files, preserving file bytes across refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".pages-canvas").evaluate((element) => {
    const dt = new DataTransfer();
    dt.setData("text/uri-list", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: 420,
        clientY: 350,
      }),
    );
  });
  await expect(
    node(page, "Link").getByRole("img", { name: "Video thumbnail" }),
  ).toBeVisible();
  await page.locator(".pages-canvas").evaluate((element) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File(["private bytes"], "example.pdf", { type: "application/pdf" }),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: 760,
        clientY: 350,
      }),
    );
  });
  await expect(openButton(page, "example.pdf")).toBeVisible();
  await page.reload();
  await expect(openButton(page, "example.pdf")).toBeVisible();
  const text = await page.evaluate(async () => {
    const p = JSON.parse(localStorage.getItem("stillroom-pages:v1")!).find(
      (p: { title: string }) => p.title === "example.pdf",
    );
    return new Promise<string>((resolve, reject) => {
      const request = indexedDB.open("stillroom-files", 1);
      request.onsuccess = () => {
        const get = request.result
          .transaction("files")
          .objectStore("files")
          .get(p.content);
        get.onsuccess = async () => {
          resolve(await get.result.text());
          request.result.close();
        };
        get.onerror = reject;
      };
    });
  });
  expect(text).toBe("private bytes");
});
test("rejects oversized files without creating empty pages", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".pages-canvas").evaluate((element) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(21 * 1024 * 1024)], "too-big.pdf"));
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: 500,
        clientY: 300,
      }),
    );
  });
  await expect(page.getByRole("status")).toContainText("20 MiB");
  await expect(openButton(page, "too-big.pdf")).toHaveCount(0);
});
test("moves and resizes pages and saves their canvas positions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("Movable");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const a = (await node(page, "Movable").boundingBox())!;
  await page.mouse.move(a.x + 8, a.y + 80);
  await page.mouse.down();
  await page.mouse.move(a.x + 150, a.y + 180, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("stillroom-pages:v1")!).find(
            (p: { title: string }) => p.title === "Movable",
          ).y,
      ),
    )
    .toBeGreaterThan(100);
  const before = (await node(page, "Movable").boundingBox())!;
  const handle = node(page, "Movable").locator(
    ".react-flow__resize-control.bottom.right",
  );
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 70, h.y + 50, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await node(page, "Movable").boundingBox())!.width)
    .toBeGreaterThan(before.width + 30);
  await page.reload();
  await expect
    .poll(async () => (await node(page, "Movable").boundingBox())!.width)
    .toBeGreaterThan(before.width + 30);
});
test("aligns selected pages and closes the tools after the action", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Align A");
  await make(page, "Align B");
  const b = (await node(page, "Align B").boundingBox())!;
  await drag(page, "Align B", { x: b.x + 60, y: b.y + 300 });
  await page.mouse.up();
  await node(page, "Align A").click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("Shift");
  await node(page, "Align B").click({ position: { x: 12, y: 12 } });
  await page.keyboard.up("Shift");
  await page
    .getByRole("button", { name: "Align and distribute", exact: true })
    .click();
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  await expect(
    page.getByRole("toolbar", {
      name: "Selection, alignment and distribution",
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("stillroom-pages:v1")!);
      return (
        p.find((p: { title: string }) => p.title === "Align A").x ===
        p.find((p: { title: string }) => p.title === "Align B").x
      );
    }),
  ).toBe(true);
});
test("searches all nesting levels and opens the result with its full breadcrumbs", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Search parent");
  await open(page, "Search parent");
  await make(page, "Unique nested result");
  await home(page);
  await page
    .getByRole("textbox", { name: "Search pages" })
    .fill("Unique nested");
  await open(page, "Unique nested result");
  await expect(page.locator(".breadcrumbs")).toContainText("Search parent");
});
test("toolbar pages drag onto a canvas without overlays or extra instructions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add page", exact: true })
    .evaluate((tool) => {
      const dt = new DataTransfer();
      tool.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }),
      );
      const canvas = document.querySelector(".pages-canvas")!;
      canvas.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: 600,
          clientY: 400,
        }),
      );
    });
  await expect(openButton(page, "Untitled page")).toBeVisible();
  await expect(page.getByText("Drop it here", { exact: true })).toHaveCount(0);
});
test("mobile navigation keeps the hierarchy accessible without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New page", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse pages", exact: true }).click();
  await expect(page.locator(".pages-tree")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("duplicates a page with its full nested hierarchy and supports Undo", async ({
  page,
}) => {
  await page.goto("/");
  await make(page, "Copy parent");
  await open(page, "Copy parent");
  await make(page, "Copy child");
  await home(page);
  await node(page, "Copy parent").click({ position: { x: 12, y: 12 } });
  await page
    .getByRole("button", { name: "Duplicate selected page", exact: true })
    .click();
  await expect(openButton(page, "Copy parent — copy")).toBeVisible();
  await open(page, "Copy parent — copy");
  await expect(openButton(page, "Copy child")).toBeVisible();
  await home(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(openButton(page, "Copy parent — copy")).toHaveCount(0);
  await expect(openButton(page, "Copy parent")).toBeVisible();
});

test("edits to-dos inline, reorders them with drag handles, preserves completion and supports Undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  await expect(page.locator(".page-modal")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rename Untitled page", exact: true })
    .click();
  const title = page.getByRole("textbox", { name: "Page title", exact: true });
  await title.fill("Inline tasks");
  await title.press("Enter");
  const card = node(page, "Inline tasks"),
    add = card.getByRole("textbox", { name: "New to-do", exact: true });
  for (const text of ["First", "Second"]) {
    await add.fill(text);
    await add.press("Enter");
  }
  await add.fill("Third");
  await card
    .getByRole("button", { name: "Add to-do item", exact: true })
    .click();
  await expect(
    card.getByRole("textbox", { name: "To-do 3", exact: true }),
  ).toHaveValue("Third");
  await card
    .getByRole("textbox", { name: "To-do 2", exact: true })
    .fill("Edited second");
  await card
    .getByRole("textbox", { name: "To-do 2", exact: true })
    .press("Enter");
  await card
    .getByRole("checkbox", { name: "Complete task 2", exact: true })
    .check();
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stillroom-pages:v1")!).find(
      (p: { title: string }) => p.title === "Inline tasks",
    ),
  );
  await card
    .getByRole("button", { name: "Reorder task 3", exact: true })
    .dragTo(card.getByRole("textbox", { name: "To-do 1", exact: true }), {
      targetPosition: { x: 30, y: 2 },
    });
  await expect(
    card.getByRole("textbox", { name: "To-do 1", exact: true }),
  ).toHaveValue("Third");
  await expect(
    card.getByRole("textbox", { name: "To-do 3", exact: true }),
  ).toHaveValue("Edited second");
  await expect(
    card.getByRole("checkbox", { name: "Complete task 3", exact: true }),
  ).toBeChecked();
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stillroom-pages:v1")!).find(
      (p: { title: string }) => p.title === "Inline tasks",
    ),
  );
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.parent_id).toBe(before.parent_id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    card.getByRole("textbox", { name: "To-do 1", exact: true }),
  ).toHaveValue("First");
  await card
    .getByRole("button", { name: "Reorder task 1", exact: true })
    .focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(
    card.getByRole("textbox", { name: "To-do 1", exact: true }),
  ).toHaveValue("Edited second");
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    card.getByRole("textbox", { name: "To-do 1", exact: true }),
  ).toHaveValue("Edited second");
  await card
    .getByRole("button", { name: "Remove task 2", exact: true })
    .click();
  await expect(
    card.getByRole("textbox", { name: "To-do 2", exact: true }),
  ).toHaveValue("Third");
  await open(page, "Inline tasks");
  const opened = page.locator(".page-own-content");
  await opened
    .getByRole("textbox", { name: "New to-do", exact: true })
    .fill("Opened page task");
  await opened
    .getByRole("textbox", { name: "New to-do", exact: true })
    .press("Enter");
  await expect(
    opened.getByRole("textbox", { name: "To-do 3", exact: true }),
  ).toHaveValue("Opened page task");
});

test("keeps an inline task draft when another browser changes the page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  const card = node(page, "Untitled page"),
    add = card.getByRole("textbox", { name: "New to-do", exact: true });
  await add.fill("Original");
  await add.press("Enter");
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  const task = card.getByRole("textbox", { name: "To-do 1", exact: true });
  await task.fill("My unsaved draft");
  await page.evaluate(() => {
    const key = "stillroom-pages:v1",
      pages = JSON.parse(localStorage.getItem(key)!);
    const p = pages.find(
      (p: { kind: string }) =>
        p.kind === "checklist" && p.title === "Untitled page",
    );
    p.content = "[ ] Someone else's edit";
    p.version++;
    localStorage.setItem(key, JSON.stringify(pages));
  });
  await task.press("Enter");
  await expect(card.getByRole("alert")).toContainText("Your draft is kept");
  await expect(task).toHaveValue("My unsaved draft");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("stillroom-pages:v1")!).find(
          (p: { kind: string }) =>
            p.kind === "checklist" && p.title === "Untitled page",
        ).content,
    ),
  ).toBe("[ ] Someone else's edit");
  await card
    .getByRole("button", { name: "Reload saved tasks", exact: true })
    .click();
  await expect(task).toHaveValue("Someone else's edit");
});

test("task insertion previews do not save until release and support exact gaps in either direction", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  const card = node(page, "Untitled page"),
    add = card.getByRole("textbox", { name: "New to-do", exact: true });
  for (const text of ["First", "Second", "Third"]) {
    await add.fill(text);
    await add.press("Enter");
  }
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { nativeTaskDrags: number }).nativeTaskDrags = 0;
    document.addEventListener("dragstart", () => {
      (window as unknown as { nativeTaskDrags: number }).nativeTaskDrags++;
    });
  });
  const handle = card.getByRole("button", {
    name: "Reorder task 3",
    exact: true,
  });
  const grip = (await handle.boundingBox())!;
  const first = (await card
    .getByRole("textbox", { name: "To-do 1", exact: true })
    .boundingBox())!;
  const second = (await card
    .getByRole("textbox", { name: "To-do 2", exact: true })
    .boundingBox())!;
  const y = (first.y + first.height + second.y) / 2;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 20, y, { steps: 12 });
  await expect(
    card.getByRole("separator", { name: "Task insertion point" }),
  ).toBeVisible();
  await expect(
    card.getByRole("textbox", { name: "To-do 2", exact: true }),
  ).toHaveValue("Second");
  expect(
    await page.evaluate(
      () => (window as unknown as { nativeTaskDrags: number }).nativeTaskDrags,
    ),
  ).toBe(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    card.getByRole("separator", { name: "Task insertion point" }),
  ).toHaveCount(0);
  await expect(
    card.getByRole("textbox", { name: "To-do 2", exact: true }),
  ).toHaveValue("Second");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 20, y, { steps: 12 });
  await page.mouse.up();
  await expect(
    card.getByRole("textbox", { name: "To-do 2", exact: true }),
  ).toHaveValue("Third");
  await expect(
    card.getByRole("textbox", { name: "To-do 3", exact: true }),
  ).toHaveValue("Second");
  await expect(
    card.getByRole("separator", { name: "Task insertion point" }),
  ).toHaveCount(0);
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  await card
    .getByRole("button", { name: "Reorder task 1", exact: true })
    .dragTo(card.getByRole("textbox", { name: "To-do 3", exact: true }), {
      targetPosition: { x: 30, y: 20 },
    });
  await expect(
    card.getByRole("textbox", { name: "To-do 1", exact: true }),
  ).toHaveValue("Third");
  await expect(
    card.getByRole("textbox", { name: "To-do 3", exact: true }),
  ).toHaveValue("First");
  await expect(card.getByText("Saving tasks…", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    card.getByRole("textbox", { name: "To-do 3", exact: true }),
  ).toHaveValue("First");
});

test("writes text notes directly on the canvas without a popup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(page.locator(".page-modal")).toHaveCount(0);
  const text = page.getByRole("textbox", { name: "Note text", exact: true });
  await text.fill("A thought written right here.\nAnother line.");
  await text.press("Tab");
  await expect(page.getByRole("status", { name: "Saving…" })).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(() => JSON.stringify(localStorage)))
    .toContain("A thought written right here.");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveValue("A thought written right here.\nAnother line.");
});
