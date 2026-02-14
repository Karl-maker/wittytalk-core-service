import Handlebars from "handlebars";
import { S3TemplatesClient } from "./s3.client";

const LAYOUT_KEY = "layout.hbs";
const PARTIALS_PREFIX = "partials/";

export class TemplateService {
  private partialsLoaded = false;

  constructor(private readonly s3: S3TemplatesClient) {}

  /** Load layout and partials (header, footer) from S3 and register with Handlebars. */
  async ensurePartialsLoaded(): Promise<void> {
    if (this.partialsLoaded) return;

    try {
      const layoutSrc = await this.s3.getObject(LAYOUT_KEY);
      Handlebars.registerPartial("layout", layoutSrc);

      const partialKeys = await this.s3.listKeys(PARTIALS_PREFIX);
      for (const key of partialKeys) {
        const name = key.replace(PARTIALS_PREFIX, "").replace(/\.hbs$/, "");
        const src = await this.s3.getObject(key);
        Handlebars.registerPartial(name, src);
      }
    } catch (e) {
      console.warn("Could not load layout/partials, templates may not use them:", e);
    }
    this.partialsLoaded = true;
  }

  /**
   * Render HTML from a template key (e.g. "welcome.hbs") with content.
   * If templateKey is missing, returns null (caller should use content.message as body).
   */
  async render(templateKey: string, content: Record<string, unknown>): Promise<string> {
    await this.ensurePartialsLoaded();
    const src = await this.s3.getTemplate(templateKey);
    const template = Handlebars.compile(src);
    return template(content);
  }
}
