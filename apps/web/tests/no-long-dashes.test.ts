import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getRawSiteContent } from "../app/lib/site-content.server";

const LONG_DASHES = [
  String.fromCodePoint(0x2013), // en-dash
  String.fromCodePoint(0x2014), // em-dash
];

function containsLongDash(str: string): boolean {
  return LONG_DASHES.some(dash => str.includes(dash));
}

describe("Typography - No Long Dashes", () => {
  it("default-site-content.json does not contain long dashes", () => {
    const defaultPath = path.resolve(__dirname, "../app/content/default-site-content.json");
    const content = fs.readFileSync(defaultPath, "utf-8");
    expect(containsLongDash(content)).toBe(false);
  });

  it("editorial contents are properly normalized", () => {
    // Write a corrupted file to disk using mock or just call the validation directly
    // Wait, getRawSiteContent reads from data/site-content.json by default if it exists, or returns defaultContent.
    // Instead of mocking fs here, we can just test the normalisation in site-content.server.ts directly using validateSiteContent.
    // But validateSiteContent is not exported. We can inject a corrupted JSON in the test directory and point process.env.SITE_CONTENT_PATH there.
    const tempDir = path.resolve(__dirname, "temp-test-dashes");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const tempFile = path.join(tempDir, "site-content.json");
    
    // We get the default, inject some dashes in a localized string and an ID, then write it.
    const defaultData = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../app/content/default-site-content.json"), "utf-8"));
    const enDash = String.fromCodePoint(0x2013);
    const emDash = String.fromCodePoint(0x2014);
    
    defaultData.home.hero.smallTitle.fr = `Test ${enDash} fr`;
    defaultData.home.hero.smallTitle.en = `Test ${emDash} en`;
    
    // An ID should NOT be modified! (If we put dashes in an ID, it would fail schema validation anyway, but let's test a legal name)
    defaultData.business.legalName = `My Business ${enDash}`;
    
    // We add some accents
    defaultData.home.hero.largeTitle.fr = `Élégance ${enDash} absolue`;
    
    fs.writeFileSync(tempFile, JSON.stringify(defaultData));
    
    const origPath = process.env.SITE_CONTENT_PATH;
    process.env.SITE_CONTENT_PATH = tempFile;
    
    try {
      const { content, isCorrupted } = getRawSiteContent();
      expect(isCorrupted).toBe(false);
      
      // Check normalization in editorial content
      expect(content.home.hero.smallTitle.fr).toBe("Test - fr");
      expect(content.home.hero.smallTitle.en).toBe("Test - en");
      expect(content.home.hero.largeTitle.fr).toBe("Élégance - absolue"); // Accents preserved
      
      // Check that non-editorial fields were NOT normalized!
      // legalName is a string, NOT a LocalizedString
      expect(content.business.legalName).toBe(`My Business ${enDash}`);
      
    } finally {
      process.env.SITE_CONTENT_PATH = origPath;
      fs.unlinkSync(tempFile);
      fs.rmdirSync(tempDir);
    }
  });

  it("source files do not contain long dashes", () => {
    // Static check over app directory
    const appDir = path.resolve(__dirname, "../app");
    const checkDir = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          checkDir(fullPath);
        } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") || fullPath.endsWith(".css")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          // Ignore this very test file if it was in app/, but it's in tests/
          if (containsLongDash(content)) {
            throw new Error(`File ${fullPath} contains long dashes`);
          }
        }
      }
    };
    checkDir(appDir);
  });
});
