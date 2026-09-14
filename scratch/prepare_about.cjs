const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, '../apps/web/app/lib/site-content.server.ts');
let content = fs.readFileSync(contentPath, 'utf-8');

// 1. Add AboutPageContent interface after PricingPageContent
const aboutPageInterface = `
export interface AboutPageContent {
  seo: {
    title: LocalizedString;
    description: LocalizedString;
  };
  hero: {
    title: LocalizedString;
    subtitle: LocalizedString;
  };
  team: {
    name: LocalizedString;
    role: LocalizedString;
    bio: LocalizedString;
    image: HomeImageMetadata;
  };
  approach: {
    title: LocalizedString;
    principles: Array<{
      id: string;
      title: LocalizedString;
      text: LocalizedString;
    }>;
  };
  difference: {
    title: LocalizedString;
    text: LocalizedString;
  };
}
`;
content = content.replace(/export interface PricingPageContent \{[\s\S]*?\}/, match => match + '\n' + aboutPageInterface);

// 2. Update SiteContent interface
content = content.replace(/schemaVersion: 4;/, 'schemaVersion: 5;');
content = content.replace(/pricingPage: PricingPageContent;/, 'pricingPage: PricingPageContent;\n  aboutPage: AboutPageContent;');

// 3. Add validateAboutPageContent function before validateSiteContent
const validateAboutPageFunc = `
function validateAboutPageContent(data: unknown): AboutPageContent {
  assertExactKeys(data, ["seo", "hero", "team", "approach", "difference"], "aboutPage");
  const obj = data as Record<string, unknown>;

  // SEO
  assertExactKeys(obj.seo, ["title", "description"], "aboutPage.seo");
  const seo = obj.seo as Record<string, unknown>;
  const validSeo = {
    title: validateLocalizedString(seo.title, "aboutPage.seo.title", 255),
    description: validateLocalizedString(seo.description, "aboutPage.seo.description", 1000)
  };

  // Hero
  assertExactKeys(obj.hero, ["title", "subtitle"], "aboutPage.hero");
  const hero = obj.hero as Record<string, unknown>;
  const validHero = {
    title: validateLocalizedString(hero.title, "aboutPage.hero.title", 255),
    subtitle: validateLocalizedString(hero.subtitle, "aboutPage.hero.subtitle", 1000)
  };

  // Team
  assertExactKeys(obj.team, ["name", "role", "bio", "image"], "aboutPage.team");
  const team = obj.team as Record<string, unknown>;
  const validTeam = {
    name: validateLocalizedString(team.name, "aboutPage.team.name", 255),
    role: validateLocalizedString(team.role, "aboutPage.team.role", 255),
    bio: validateLocalizedString(team.bio, "aboutPage.team.bio", 3000),
    image: validateHomeImageMetadata(team.image, "aboutPage.team.image")
  };

  // Approach
  assertExactKeys(obj.approach, ["title", "principles"], "aboutPage.approach");
  const approach = obj.approach as Record<string, unknown>;
  if (!Array.isArray(approach.principles)) {
    throw new ValidationError("aboutPage.approach.principles must be an array");
  }
  if (approach.principles.length !== 3) {
    throw new ValidationError("aboutPage.approach.principles must contain exactly 3 items");
  }
  const validPrinciples = approach.principles.map((p, i) => {
    assertExactKeys(p, ["id", "title", "text"], \`aboutPage.approach.principles[\${i}]\`);
    const pObj = p as Record<string, unknown>;
    if (typeof pObj.id !== "string" || !["discretion", "single-studio", "timeless"].includes(pObj.id)) {
      throw new ValidationError(\`aboutPage.approach.principles[\${i}].id is invalid\`);
    }
    return {
      id: pObj.id,
      title: validateLocalizedString(pObj.title, \`aboutPage.approach.principles[\${i}].title\`, 255),
      text: validateLocalizedString(pObj.text, \`aboutPage.approach.principles[\${i}].text\`, 2000)
    };
  });
  
  // Verify that all 3 expected IDs are present and unique
  const ids = new Set(validPrinciples.map(p => p.id));
  if (ids.size !== 3 || !ids.has("discretion") || !ids.has("single-studio") || !ids.has("timeless")) {
     throw new ValidationError("aboutPage.approach.principles must contain exactly 'discretion', 'single-studio', and 'timeless'");
  }

  // Difference
  assertExactKeys(obj.difference, ["title", "text"], "aboutPage.difference");
  const diff = obj.difference as Record<string, unknown>;
  const validDiff = {
    title: validateLocalizedString(diff.title, "aboutPage.difference.title", 255),
    text: validateLocalizedString(diff.text, "aboutPage.difference.text", 3000)
  };

  return {
    seo: validSeo,
    hero: validHero,
    team: validTeam,
    approach: { title: validateLocalizedString(approach.title, "aboutPage.approach.title", 255), principles: validPrinciples },
    difference: validDiff
  };
}
`;
content = content.replace(/export function validateSiteContent/, match => validateAboutPageFunc + '\n' + match);

// 4. Update validateSiteContent
content = content.replace(/obj\.schemaVersion !== 1 && obj\.schemaVersion !== 2 && obj\.schemaVersion !== 3 && obj\.schemaVersion !== 4/g, 'obj.schemaVersion !== 1 && obj.schemaVersion !== 2 && obj.schemaVersion !== 3 && obj.schemaVersion !== 4 && obj.schemaVersion !== 5');

// 5. Inject aboutPage for V1 to V4
const v1ToV4Migration = `
  if (obj.schemaVersion === 1 || obj.schemaVersion === 2 || obj.schemaVersion === 3 || obj.schemaVersion === 4) {
    const aboutPageData = JSON.parse(JSON.stringify(defaultContent.aboutPage));
    objRef = { ...objRef, aboutPage: aboutPageData };
  }
`;
content = content.replace(/assertExactKeys\(objRef, \["schemaVersion", "revision", "updatedAt", "business", "pricing", "home", "pricingPage"\], "root"\);/, match => v1ToV4Migration + '\n  assertExactKeys(objRef, ["schemaVersion", "revision", "updatedAt", "business", "pricing", "home", "pricingPage", "aboutPage"], "root");');

content = content.replace(/schemaVersion: 4,/g, 'schemaVersion: 5,');
content = content.replace(/pricingPage: validatePricingPageContent\(objRef\.pricingPage\),/, 'pricingPage: validatePricingPageContent(objRef.pricingPage),\n    aboutPage: validateAboutPageContent(objRef.aboutPage),');

// 6. Add saveAboutPageSettings
const saveAboutPageFunc = `
export function saveAboutPageSettings(aboutPage: AboutPageContent, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.isCorrupted) {
    throw new CorruptedContentError();
  }
  if (current.content.revision !== previousRevision) {
    throw new RevisionConflictError();
  }

  const newContent: SiteContent = {
    ...current.content,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
    aboutPage: validateAboutPageContent(aboutPage),
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}
`;
content = content + '\n' + saveAboutPageFunc;

fs.writeFileSync(contentPath, content);
console.log("Updated site-content.server.ts");

// Update default-site-content.json
const defaultJsonPath = path.join(__dirname, '../apps/web/app/content/default-site-content.json');
const defaultJson = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf-8'));
defaultJson.schemaVersion = 5;
defaultJson.aboutPage = {
  seo: {
    title: { fr: "À propos — Sempra", en: "About us — Sempra" },
    description: { fr: "Deux regards, une même exigence : capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans.", en: "Two perspectives, one standard: capturing your day with precision, so it comes back to you intact in thirty years." }
  },
  hero: {
    title: { fr: "Arrêter le temps, rendre le jour éternel.", en: "Stop time, make the day eternal." },
    subtitle: { fr: "Deux regards, une même exigence : capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans.", en: "Two perspectives, one standard: capturing your day with precision, so it comes back to you intact in thirty years." }
  },
  team: {
    name: { fr: "L'équipe Sempra", en: "The Sempra Team" },
    role: { fr: "Photographe & Vidéaste", en: "Photographer & Videographer" },
    bio: { fr: "Nous sommes un studio spécialisé dans la photographie et la vidéo de mariage. Notre objectif est de capturer votre journée de manière authentique, avec deux regards complémentaires.", en: "We are a studio specialized in wedding photography and videography. Our goal is to capture your day authentically, with two complementary perspectives." },
    image: {
      imageId: null,
      variants: [],
      alt: { fr: "L'équipe Sempra, studio de photographie et de vidéo", en: "The Sempra team, photography and videography studio" }
    }
  },
  approach: {
    title: { fr: "Notre approche", en: "Our approach" },
    principles: [
      { id: "discretion", title: { fr: "Discrétion le jour J", en: "Discretion on the day" }, text: { fr: "Présents sans jamais s'imposer, pour que vous viviez votre journée pleinement.", en: "Present without ever imposing, so you can live your day fully." } },
      { id: "single-studio", title: { fr: "Un seul studio", en: "One studio" }, text: { fr: "Photo et film pensés ensemble, pour une même sensibilité du début à la fin.", en: "Photo and film conceived together, for the same sensitivity from start to finish." } },
      { id: "timeless", title: { fr: "Un rendu intemporel", en: "A timeless result" }, text: { fr: "Des choix sobres et durables, qui vieillissent bien — loin des effets de mode.", en: "Sober and lasting choices that age well — far from passing trends." } }
    ]
  },
  difference: {
    title: { fr: "Notre différence", en: "Our difference" },
    text: { fr: "Réunir la photo et le film sous un même studio, c'est une cohérence de regard du premier au dernier plan — et une présence commune le jour J, pour ne rien manquer de votre histoire.", en: "Uniting photo and film under one studio means a coherent vision from the first to the last frame — and a shared presence on the day, to miss nothing of your story." }
  }
};
fs.writeFileSync(defaultJsonPath, JSON.stringify(defaultJson, null, 2) + '\\n');
console.log("Updated default-site-content.json");
