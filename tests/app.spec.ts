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
