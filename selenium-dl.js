const { Capabilities, Builder, By, Key, until, error } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs');

function checkFileDownloadedWithTimeout(folderPath, timeout) {
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            watcher.close();
            reject(new Error('File did not exists and was not created during the timeout.'));
        }, timeout);

        var watcher = fs.watch(folderPath, function (eventType, filename) {
            if (eventType === 'rename' && filename.startsWith('Obsidian') && filename.endsWith('.xapk')) {
                clearTimeout(timer);
                watcher.close();
                resolve(filename);
            }
        });
    });
}

// Set download folder
const downloadFolder = '/out';
const hostDownloadFolder = './out';

const firefoxOptions = new firefox.Options();
firefoxOptions.setPreference('browser.download.folderList', 2); // Use custom download path
firefoxOptions.setPreference('browser.download.dir', downloadFolder); // Define the download path
firefoxOptions.setPreference('browser.download.useDownloadDir', true); // Use download dir without asking
firefoxOptions.setPreference('browser.helperApps.neverAsk.saveToDisk', 'application/zip'); // MIME type of file, change per requirement
firefoxOptions.setPreference('browser.download.manager.showWhenStarting', false); // Disable download manager UI
firefoxOptions.headless();
firefoxOptions.windowSize({width: 10, height: 10});

// Configure Chrome Options
const chromeOptions = new chrome.Options();
chromeOptions.setUserPreferences({
    "download.default_directory": downloadFolder,
    "download.prompt_for_download": false,
    "download.directory_upgrade": true,
    "safebrowsing.enabled": true
});

chromeOptions.addArguments(
    [
        '--no-sandbox',
        '--headless',
        '--disable-dev-shm-usage',
    ]
);

(async function downloadApk() {
    console.log('Starting the driver...')
    let driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(firefoxOptions)
        .usingServer('http://localhost:4444') // <-- Apply usingServer and that's it
        .build();

    try {
        console.log('Set timeouts...');
        await driver.manage().setTimeouts({
            implicit: 1000,
            pageLoad: 1000,
            script: 1000,
        });

        console.log('Opening the download page...');
        driver.get('https://d.apkpure.com/b/XAPK/md.obsidian?version=latest')
            .catch((err) => {
                if (err instanceof error.TimeoutError) {
                    console.log("Timeout reached, continuing...");
                } else {
                    console.error(`Unknown error: ${err}`);
                }
            });

        console.log('Opened the page, waiting for download...');
        await checkFileDownloadedWithTimeout(`${hostDownloadFolder}`, 10000).then(
            (filePath) => {
                console.log(`File downloaded: ${filePath}`);
            },
            (err) => {
                console.log(`Download failed: ${err}`);
            }
        );
    } catch (err) {
        console.log(`Done with error: ${err}`)
        await driver.quit();
    } finally {
        await driver.quit();
    }
})();