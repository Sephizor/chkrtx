import { Builder, By, until } from 'selenium-webdriver';
import nodeNotifier from 'node-notifier';
import { Options } from 'selenium-webdriver/chrome.js';
import winston from 'winston';
import open from 'open';
import fs from 'fs';

const settings = JSON.parse(fs.readFileSync('settings.json'));

if(fs.existsSync('settings.local.json')) {
    Object.assign(settings, JSON.parse(fs.readFileSync('settings.local.json')));
}

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.align(),
                winston.format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}`)
            )
        })
    ]
});

if(settings.login && (settings.amazonPassword === '' || settings.amazonUsername === '')) {
    logger.error('Login requested but username or password are empty');
    process.exit(-1);
}
if(settings.autobuy && (!settings.login || settings.amazonUsername === '' || settings.amazonPassword === '')) {
    logger.error('Autobuy requires login to be set as well as your Amazon username and password');
    process.exit(-1);
}

let bought = 0;

const chromeOptions = new Options();
chromeOptions.headless();
chromeOptions.windowSize({ width: 1920, height: 1080 });
chromeOptions.addArguments([
    '--disable-gpu',
    '--disable-logging',
    '--log-level=3',
    '--disable-crash-reporter',
    '--disable-in-process-stack-traces'
]);

const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();

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

async function checkForButton(cardName, url, maxPrice) {
    const elements = await driver.findElements(By.id('buy-now-button'));
    if (elements.length > 0) {
        return true;
    }
    return false;
}

async function getPrice() {
    const element = await driver.findElement(By.id('priceblock_ourprice'));
    if(await element.isDisplayed()) {
        return parseFloat((await element.getText()).replace('£', ''));
    }
    return -1;
}

async function buyCard() {
    if(settings.autobuyLimit < bought) {

    }
    bought++;
}

async function checkCard(cardName, url, maxPrice) {
    logger.info(`Checking ${cardName}`);
    await driver.get(url);
    const inStock = await checkForButton(cardName, url, maxPrice);
    if(inStock) {
        const price = await getPrice();
        if(maxPrice === 0 || price <= maxPrice) {
            nodeNotifier.notify({
                title: 'RTX Finder',
                message: `Found card ${cardName} for £${price.toFixed(2)}`,
            }, () => {
                open(url);
            });
            if(settings.autobuy) {
                await buyCard();
            }
        }
    }
    logger.info(`Finished checking ${cardName}`);
}

(async function findRtx() {
    try {
        if(settings.login) {
            await login();
        }
        while (true) {
            for(const card of settings.cards) {
                const maxPrice = card.maxPrice !== undefined ? card.maxPrice : settings.maxPrice;
                await checkCard(card.name, card.url, maxPrice);
            }
            logger.info(`Finished checking all cards; sleeping for ${settings.sleepTime} seconds`);
            await driver.sleep(1000 * settings.sleepTime);
        }
    }
    finally {
        await driver.quit();
    }
})();