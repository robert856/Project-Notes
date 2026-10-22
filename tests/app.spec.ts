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
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("Tasks");
  await page
    .getByRole("textbox", { name: "Page content" })
    .fill("[ ] First task\n[x] Done");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await node(page, "Tasks").getByRole("checkbox").first().check();
  await expect(node(page, "Tasks").getByRole("checkbox").first()).toBeChecked();
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
  await make(page, "Movable");
  const a = (await node(page, "Movable").boundingBox())!;
  await drag(page, "Movable", { x: a.x + 150, y: a.y + 180 });
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
