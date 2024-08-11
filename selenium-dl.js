const { Capabilities, Builder, By, Key, until, error } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs');
let rssParser = require('rss-parser');

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function checkFileDownloadedWithTimeout(folderPath, timeout) {
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            watcher.close();
            // check for the existence of the file one last time
            fs.readdirSync(folderPath).forEach(file => {
                if (file.startsWith('md.obsidian') && file.endsWith('.apk')) {
                    resolve(file);
                }
            });
            reject(new Error('File does not exist and was not created during the timeout.'));
        }, timeout);

        var watcher = fs.watch(folderPath, function (eventType, filename) {
            console.log(`Event: ${eventType}, Filename: ${filename}`);
            if (eventType === 'rename' && filename.startsWith('md.obsidian') && filename.endsWith('.apk')) {
                clearTimeout(timer);
                watcher.close();
                resolve(filename);
            }
        });
    });
}

async function fetchLatestDownloadLink() {
    let parser = new rssParser();
    let feedUrl = 'https://www.apkmirror.com/apk/dynalist-inc/obsidian/variant-{"arches_slug":["arm64-v8a","armeabi-v7a","x86","x86_64"]}/feed';

    let feed = await parser.parseURL(feedUrl);

    if (feed.items.length > 0) {
        return feed.items[0].link;
    } else {
        console.error('No items found in feed');
        return null;
    }
}

// Set download folder
const downloadFolder = '/out';
const hostDownloadFolder = './headless-browser/out/';

const firefoxOptions = new firefox.Options()
    .setPreference('browser.download.folderList', 2) // Use custom download path
    .setPreference('browser.download.dir', downloadFolder) // Define the download path
    .setPreference('browser.download.useDownloadDir', true) // Use download dir without asking
    .setPreference('browser.helperApps.neverAsk.saveToDisk', 'application/zip') // MIME type of file, change per requirement
    .setPreference('browser.download.manager.showWhenStarting', false) // Disable download manager UI
    .headless()
    .addExtensions(['./headless-browser/addons/uBlock0_1.52.2.firefox.signed.xpi'])
    .windowSize({ width: 1920, height: 1080 });

(async function downloadApk() {
    console.log('Starting the driver...')
    let driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(firefoxOptions)
        .usingServer('http://localhost:4444') // <-- Apply usingServer and that's it
        .build();

    try {
        console.log('Opening the download page...');

        let link = await fetchLatestDownloadLink();
        if (!link) {
            console.error('No download link found in feed');
            return;
        }

        await driver.get(link);

        let relativeUrl = await driver.findElement(By.className('downloadButton')).getAttribute('href');

        // downloads dont provide a page so we need to expect a timeout
        console.log('Set timeouts...');
        await driver.manage().setTimeouts({
            implicit: 1000,
            pageLoad: 1000,
            script: 1000,
        });

        await driver.get(relativeUrl)
            .catch((err) => {
                if (err instanceof error.TimeoutError) {
                    console.log("Timeout reached, continuing...");
                } else {
                    console.error(`Unknown error: ${err}`);
                }
            });

        console.log('Opened the page, waiting for download...');
        await checkFileDownloadedWithTimeout(`${hostDownloadFolder}`, 20000).then(
            (filePath) => {
                console.log(`File downloaded: ${filePath}`);
            },
            (err) => {
                console.log(`Download failed: ${err}`);
                throw new Error('Download failed');
            }
        );
    } catch (err) {
        console.log(`Done with error: ${err}, saving screenshot to ss.png`);
        // take screenshot and save to file
        await driver.takeScreenshot().then((img) => {
            fs.writeFileSync('ss.png', img, 'base64')
        })
        await driver.quit();
        // exit with code 1
        process.exit(1);
    } finally {
        console.log('Done.');
        await driver.quit();
        // exit with code 0
        process.exit(0);
    }
})();