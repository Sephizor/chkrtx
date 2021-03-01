import {Builder, By, until} from 'selenium-webdriver';
import nodeNotifier from 'node-notifier';
import {Options} from 'selenium-webdriver/chrome.js';
import winston from 'winston';
import open from 'open';
import fs from 'fs';
import path from 'path';

(async function findRtx() {
  const settings = JSON.parse(fs.readFileSync('settings.json'));

  if (fs.existsSync('settings.local.json')) {
    Object.assign(settings, JSON.parse(fs.readFileSync('settings.local.json')));
  }

  const logger = winston.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.align(),
          winston.format.printf((info) => `${info.timestamp} [${info.level}]: ${info.message}`),
        ),
      }),
    ],
  });

  if (settings.login && (settings.amazonPassword === '' || settings.amazonUsername === '')) {
    logger.error('Login requested but username or password are empty');
    process.exit(-1);
  }
  if (settings.autobuy && (!settings.login || settings.amazonUsername === '' || settings.amazonPassword === '')) {
    logger.error('Autobuy requires login to be set as well as your Amazon username and password');
    process.exit(-1);
  }

  let bought = 0;

  const chromeOptions = new Options();
  chromeOptions.headless();
  chromeOptions.windowSize({width: 1920, height: 1080});
  chromeOptions.addArguments([
    '--disable-gpu',
    '--disable-logging',
    '--log-level=3',
    '--disable-crash-reporter',
    '--disable-in-process-stack-traces',
  ]);

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();

  /**
   * @description Logs into your Amazon account
   */
  async function login() {
    await driver.get('https://amazon.co.uk/');
    logger.info('Logging in');
    await driver.findElement(By.id('nav-link-accountList-nav-line-1')).click();
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('ap_email'))), 5000);
    await driver.findElement(By.id('ap_email')).sendKeys(settings.amazonUsername);
    await driver.findElement(By.id('continue')).click();
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('ap_password'))), 5000);
    await driver.findElement(By.id('ap_password')).sendKeys(settings.amazonPassword);
    await driver.findElement(By.id('signInSubmit')).click();
    logger.info('Completed login');
  }

  /**
   * @description Checks for the existence of the "Buy Now" button on an Amazon product page
   */
  async function checkForButton() {
    const elements = await driver.findElements(By.id('buy-now-button'));
    if (elements.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * @description Retrieves the price of the product from the right-hand product information panel
   * @return {number} The price of the card
   */
  async function getPrice() {
    const element = await driver.findElement(By.id('price_inside_buybox'));
    if (await element.isDisplayed()) {
      return parseFloat((await element.getText()).replace('£', ''));
    }
    return -1;
  }

  /**
   * @description Clicks the "Buy Now" button with the default shipping address and billing details set up
   * On your Amazon account
   */
  async function buyCard() {
    if (bought < settings.autobuyLimit) {
      await driver.findElement(By.id('buy-now-button')).click();
      await driver.findElement(By.id('turbo-checkout-pyo-button')).click();
      bought++;
      await driver.sleep(5000);
    }
  }

  /**
   * @description Main function for checking the existence of a product
   * @param {string} cardName
   * @param {string} url
   * @param {number} maxPrice
   */
  async function checkCard(cardName, url, maxPrice) {
    logger.info(`Checking ${cardName}`);
    await driver.get(url);
    const inStock = await checkForButton();
    if (inStock) {
      const price = await getPrice();
      if (price === -1) {
        logger.warn(`Found card ${cardName} but could not parse price!`);
        nodeNotifier.notify({
          title: 'RTX Finder',
          message: `Found card ${cardName} but could not parse price!`,
        });
      } else if (maxPrice === 0 || price <= maxPrice) {
        logger.warn(`Found card ${cardName} for £${price.toFixed(2)}`);
        nodeNotifier.notify({
          title: 'RTX Finder',
          message: `Found card ${cardName} for £${price.toFixed(2)}`,
        }, () => {
          open(url);
        });
        if (settings.autobuy) {
          await buyCard();
        }
        await takeScreenshot();
      } else {
        logger.error(`Found card ${cardName} for £${price.toFixed(2)} but this was above your specified price! :<`);
      }
    }
    logger.info(`Finished checking ${cardName}`);
  }

  /**
   * @description Takes a screenshot of the current page
   */
  async function takeScreenshot() {
    if (settings.takeScreenshots) {
      const png = await driver.takeScreenshot();
      if (!fs.existsSync('screenshots')) {
        fs.mkdirSync('screenshots');
      }
      const date = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      }).formatToParts(new Date());
      fs.writeFileSync(`screenshots${path.sep}${date[0].value}-${date[2].value}-${date[4].value}_${date[6].value}-` +
        `${date[8].value}-${date[10].value}.png`, png, 'base64');
    }
  }

  try {
    if (settings.login) {
      await login();
    }
    while (true) {
      for (const card of settings.cards) {
        const maxPrice = card.maxPrice !== undefined ? card.maxPrice : settings.maxPrice;
        await checkCard(card.name, card.url, maxPrice);
      }
      logger.info(`Finished checking all cards; sleeping for ${settings.sleepTime} seconds`);
      await driver.sleep(1000 * settings.sleepTime);
    }
  } finally {
    await driver.quit();
  }
})();
