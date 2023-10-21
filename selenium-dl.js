const { Capabilities, Builder, By, Key, until, error } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs');

function checkFileDownloadedWithTimeout(folderPath, timeout) {
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            watcher.close();
            reject(new Error('File does not exist and was not created during the timeout.'));
        }, timeout);

        var watcher = fs.watch(folderPath, function (eventType, filename) {
            if (eventType === 'rename' && filename.startsWith('md.obsidian') && filename.endsWith('.apk')) {
                clearTimeout(timer);
                watcher.close();
                resolve(filename);
            }
        });
    });
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
    .windowSize({width: 1920, height: 400});

(async function downloadApk() {
    console.log('Starting the driver...')
    let driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(firefoxOptions)
        .usingServer('http://localhost:4444') // <-- Apply usingServer and that's it
        .build();

    try {
        console.log('Opening the download page...');
        await driver.get('https://www.apkmirror.com/apk/dynalist-inc/obsidian/variant-{"arches_slug":["arm64-v8a","armeabi-v7a","x86","x86_64"]}/')

        let button = await driver.findElement(By.className('downloadLink'));
        await button.click();

        let relativeUrl = await driver.findElement(By.className('downloadButton')).getAttribute('href');
        
        // downloads dont provide a page so we need to expect a timeout
        console.log('Set timeouts...');
        await driver.manage().setTimeouts({
            implicit: 10000,
            pageLoad: 10000,
            script: 10000,
        });

        await driver.get(relativeUrl)
            .catch((err) => {
                if (err instanceof error.TimeoutError) {
                    console.log("Timeout reached, continuing...");
                } else {
                    console.error(`Unknown error: ${err}`);
                }
            });;

        console.log('Opened the page, waiting for download...');
        await checkFileDownloadedWithTimeout(`${hostDownloadFolder}`, 20000).then(
            (filePath) => {
                console.log(`File downloaded: ${filePath}`);
            },
            (err) => {
                console.log(`Download failed: ${err}`);
            }
        );
    } catch (err) {
        console.log(`Done with error: ${err}`)
        // await driver.quit();
    } finally {
        console.log('Done.');
        // gets stuck, dont use
        // await driver.quit();
    }
})();