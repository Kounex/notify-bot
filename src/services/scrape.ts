import { injectable } from 'inversify/lib/annotation/injectable.js';
import puppeteer from 'puppeteer';
import {
  ScrapeResult,
  ScrapeResultType,
} from '../types/classes/scrape-result.js';
import { Observe } from '../types/models/observe.js';
import { prisma } from '../utils/db.js';

import { inject } from 'inversify';
import { TYPES } from '../types.js';
import SettingsService from './settings.js';

@injectable()
export default class ScrapeService {
  constructor(
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
  ) {}

  async observe(observe: Observe, initial?: boolean): Promise<ScrapeResult> {
    const settings = await this.settingsService.getSettings(observe.guildId);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(observe.url);

    // var element;
    try {
      await page.waitForNetworkIdle({ timeout: settings.timeout * 1000 });
    } catch (_) {
      await browser.close();
      if (!!initial) {
        return new ScrapeResult(observe, ScrapeResultType.ElementNotFound);
      }
      return new ScrapeResult(observe, ScrapeResultType.Timeout);
    }

    try {
      /// Try to get thumbnail
      const thumbnail = await page.evaluate(() => {
        // Get all link elements in the head
        const linkElements = document.querySelectorAll(
          'head link[rel="icon"][type^="image/"]'
        );
        // Return the href attribute of the first matching link element, if exists
        return linkElements.length
          ? linkElements[0].getAttribute('href')
          : null;
      });
      if (thumbnail != null) {
        const url = new URL(thumbnail);
        observe.thumbnail = `${url.origin}${url.pathname}`;
      }
    } catch (_) {}

    const element = await page.$(observe.cssSelector);

    if (element == null) {
      return this.handleFoundChange(observe);
    }

    const domElementProperty = observe.domElementProperty;
    const text = await element.evaluate(
      (el, domElementProperty) =>
        domElementProperty == null
          ? el.textContent
          : el.getAttribute(domElementProperty),
      domElementProperty
    );

    await browser.close();

    if (
      text == null ||
      text == undefined ||
      !text
        .toLocaleLowerCase()
        .trim()
        .includes(observe.currentText.toLocaleLowerCase().trim())
    ) {
      if (!!initial) {
        return new ScrapeResult(observe, ScrapeResultType.TextNotFound);
      }

      return this.handleFoundChange(observe);
    }

    return new ScrapeResult(observe, ScrapeResultType.NoChange);
  }

  private async handleFoundChange(observe: Observe): Promise<ScrapeResult> {
    await prisma.observe.updateMany({
      where: {
        userId: observe.userId,
        name: observe.name,
      },
      data: {
        active: observe.keepActive,
      },
    });

    return new ScrapeResult(observe, ScrapeResultType.Change);
  }
}
