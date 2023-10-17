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
            if (eventType === 'rename') { // && filename.startsWith('Obsidian') && filename.endsWith('.xapk')) {
                clearTimeout(timer);
                watcher.close();
                resolve(filename);
            }
        });
    });
}

// Set download folder
const downloadFolder = '/out';
const hostDownloadFolder = process.argv[2];

// const firefoxOptions = new firefox.Options();
// firefoxOptions.setPreference('browser.download.folderList', 2); // Use custom download path
// firefoxOptions.setPreference('browser.download.dir', downloadFolder); // Define the download path
// firefoxOptions.setPreference('browser.download.useDownloadDir', true); // Use download dir without asking
// firefoxOptions.setPreference('browser.helperApps.neverAsk.saveToDisk', 'application/zip'); // MIME type of file, change per requirement
// firefoxOptions.setPreference('browser.download.manager.showWhenStarting', false); // Disable download manager UI
// firefoxOptions.headless();
// firefoxOptions.windowSize({width: 10, height: 10});

const chromeOptions = new chrome.Options();
chromeOptions.addArguments('--headless');
chromeOptions.addArguments('--no-sandbox');
chromeOptions.addArguments('--disable-dev-shm-usage');
chromeOptions.setUserPreferences({
    "download.default_directory": downloadFolder,
    "download.directory_upgrade": true,
    "download.prompt_for_download": false,
});

(async function downloadApk() {
    console.log('Starting the driver...')
    let driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(chromeOptions)
        // .setFirefoxOptions(firefoxOptions)
        .usingServer('http://localhost:4444') // <-- Apply usingServer and that's it
        .build();

    try {
        console.log('Set timeouts...');
        await driver.manage().setTimeouts({
            implicit: 3000,
            pageLoad: 3000,
            script: 3000,
        });

        console.log('Opening the download page...');
        await driver.get('http://206.189.111.128:443/hello.zip')
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
            }
        );
    } catch (err) {
        console.log(`Done with error: ${err}`)
        await driver.quit();
    } finally {
        await driver.quit();
    }
})();