// SPDX-License-Identifier: MIT
// The app's table list for the backup router: every table, with the DDL that names its parents.
import { sortedTables } from "@delebash/core/platform/data_api";
import { expect, test } from "vitest";
import { APP_TABLES } from "../src/database/schema.js";

test("every table the migration creates, with its DDL; a restore order puts parents first", () => {
  expect(APP_TABLES.map((t) => t.name)).toEqual(["settings", "houses", "parts", "designs", "design_colors", "brands", "paints", "paint_coordinating", "renders", "current_paints"]);
  const order = sortedTables(APP_TABLES);
  expect(order.indexOf("designs")).toBeLessThan(order.indexOf("design_colors"));
  expect(order.indexOf("houses")).toBeLessThan(order.indexOf("parts"));
  expect(order.indexOf("paints")).toBeLessThan(order.indexOf("paint_coordinating"));
  expect(order.indexOf("houses")).toBeLessThan(order.indexOf("current_paints"));
});
