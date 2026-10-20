import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SANDBOX_HOME, WORK_ROOT } from "./sandbox";

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`branch selects preserve their parent dialog and cancel safely (${theme}, ${width})`, async ({ page }, info) => {
      const cwd = path.join(WORK_ROOT, `branch-select-${randomUUID()}`);
      await mkdir(cwd, { recursive: true });
      const git = (...args: string[]) => execFileSync("git", ["-C", cwd, "-c", "core.hooksPath=/dev/null", ...args], {
        encoding: "utf8",
        env: { ...process.env, HOME: SANDBOX_HOME, USERPROFILE: SANDBOX_HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      }).trim();
      git("init", "-b", "main");
      git("config", "user.name", "E2E Fixture");
      git("config", "user.email", "fixture@example.invalid");
      const file = path.join(cwd, "fixture.txt");
      await writeFile(file, "committed fixture\n");
      git("add", "fixture.txt");
      git("commit", "-m", "Synthetic branch select fixture");
      const base = "feature/a-deliberately-long-base-branch-for-menu-overflow";
      git("branch", base);
      // An uncommitted change must survive every review/cancel action untouched.
      await writeFile(file, "uncommitted synthetic fixture\n");
      const snapshot = () => ({
        head: git("symbolic-ref", "HEAD"),
        refs: git("show-ref"),
        worktrees: git("worktree", "list", "--porcelain"),
        status: git("status", "--porcelain=v1"),
        diff: git("diff", "--binary", "HEAD"),
      });
      const before = snapshot();
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => localStorage.setItem("pi-theme", theme), theme);
      await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const composer = page.getByRole("textbox", { name: "Message", exact: true });
      await expect(composer).toBeEditable();
      const trigger = page.getByRole("button", { name: "⑂ main", exact: true }).first();
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Git branch", exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Create branch", exact: true }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("feature/not-created");
      const baseSelect = dialog.getByRole("combobox", { name: "Base branch", exact: true });
      const locationSelect = dialog.getByRole("combobox", { name: "Location", exact: true });
      await baseSelect.click();
      const listbox = page.getByRole("listbox", { name: "Base branch", exact: true });
      await expect(listbox).toBeVisible();
      // Exercise the actual portal, not a substitute select inside the dialog.
      expect(await listbox.evaluate(el => el.closest(".workbench-branch-control") === null)).toBe(true);
      await page.screenshot({ path: info.outputPath(`branch-base-menu-${theme}-${width}.png`), animations: "disabled" });
      await listbox.getByRole("option", { name: base, exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(baseSelect).toHaveText(base);
      await expect(listbox).toHaveCount(0);
      await locationSelect.click();
      const locations = page.getByRole("listbox", { name: "Location", exact: true });
      await expect(locations).toBeVisible();
      await page.screenshot({ path: info.outputPath(`branch-location-menu-${theme}-${width}.png`), animations: "disabled" });
      await locations.getByRole("option", { name: "New worktree", exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(locationSelect).toHaveText("New worktree");
      await expect(baseSelect).toHaveText(base);
      await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("feature/not-created");
      await page.screenshot({ path: info.outputPath(`branch-form-${theme}-${width}.png`), animations: "disabled" });
      // Review is read-only. Back and close cancel it; no execute button is clicked.
      await dialog.getByRole("button", { name: "Review operation", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Create worktree", exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      await expect(baseSelect).toHaveText(base);
      await expect(locationSelect).toHaveText("New worktree");
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(snapshot()).toEqual(before);
      expect(await readFile(file, "utf8")).toBe("uncommitted synthetic fixture\n");
      await trigger.click();
      await expect(dialog).toBeVisible();
      await expect(baseSelect).toHaveText(base);
      await expect(locationSelect).toHaveText("New worktree");
      // The popup intentionally covers the textarea center. Find an actually
      // exposed textarea point, then use a real pointer click (never force or
      // dispatchEvent) so this still verifies the outside-dismissal handler.
      const outsidePoint = await composer.evaluate(el => {
        const rect = el.getBoundingClientRect();
        for (const x of [4, rect.width - 4]) {
          for (const y of [4, rect.height / 2, rect.height - 4]) {
            const hit = document.elementFromPoint(rect.left + x, rect.top + y);
            if (hit && el.contains(hit) && !hit.closest(".workbench-branch-control")) return { x, y };
          }
        }
        return null;
      });
      expect(outsidePoint, "an exposed textarea point outside the branch popup").not.toBeNull();
      await composer.click({ position: outsidePoint! });
      await expect(dialog).toHaveCount(0);
      expect(snapshot()).toEqual(before);
    });
  }
}
