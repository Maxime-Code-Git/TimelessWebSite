import { describe, it, expect } from "vitest";
import routes from "../app/routes";

describe("Admin Routes", () => {
  it("should register admin/data-retention route", () => {
    // routes is an array of RouteConfig objects.
    // They are created using functions like route(), prefix(), etc.
    // However, since it's just the export from routes.ts, we can assert its structure or stringify it to check.
    const routesStr = JSON.stringify(routes);
    expect(routesStr).toContain("admin/data-retention");
    expect(routesStr).toContain("routes/admin.data-retention.tsx");
  });
});
