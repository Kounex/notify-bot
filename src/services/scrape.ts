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

    const links = await page.$$('head [type^="image/"]');

    if (links.length > 0) {
      const thumbnail = await links[0].evaluate((el) =>
        el.getAttribute('href')
      );

      if (thumbnail != null) {
        try {
          const url = new URL(`https://${thumbnail.split('//').join('')}`);
          observe.thumbnail = `${url.origin}${url.pathname}`;
        } catch (_) {}
      }
    }

    var element;
    try {
      element = await page.waitForSelector(observe.cssSelector, {
        timeout: settings.timeout * 1_000,
      });
    } catch (_) {
      try {
        await page.waitForNetworkIdle({ timeout: 1_000 });
        await browser.close();
        if (!!initial) {
          return new ScrapeResult(observe, ScrapeResultType.ElementNotFound);
        }
        return new ScrapeResult(observe, ScrapeResultType.Change);
      } catch (_) {
        await browser.close();
        return new ScrapeResult(observe, ScrapeResultType.Timeout);
      }
    }

    const domElementProperty = observe.domElementProperty;
    const text = await element!.evaluate(
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
        guildId: observe.guildId,
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
