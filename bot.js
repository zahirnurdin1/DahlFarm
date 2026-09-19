const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

function generateRandomUsername() {
  const adjectives = ['swift', 'brave', 'lucky', 'rapid', 'clever', 'golden', 'cosmic'];
  const nouns = ['eagle', 'falcon', 'tiger', 'comet', 'lynx', 'raven', 'otter'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}_${noun}_${num}`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForVisible(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 0 });
}

async function waitForButtonByText(page, text) {
  await page.waitForFunction(
    (txt) => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => {
        const content = b.textContent.trim().toLowerCase();
        const visible = b.offsetParent !== null && getComputedStyle(b).display !== 'none';
        return content.includes(txt.toLowerCase()) && visible;
      });
    },
    { timeout: 0 },
    text
  );
}

async function clickVisibleButtonByText(page, text) {
  await waitForButtonByText(page, text);
  const found = await page.evaluateHandle((txt) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find((b) => {
      const content = b.textContent.trim().toLowerCase();
      const visible = b.offsetParent !== null && getComputedStyle(b).display !== 'none';
      return content.includes(txt.toLowerCase()) && visible;
    }) || null;
  }, text);

  await found.asElement().click();
  return true;
}

const GREEN_BG = '\x1b[42m\x1b[30m';
const RED_BG = '\x1b[41m\x1b[37m';
const RESET = '\x1b[0m';

async function createSingleAccount(browser, index, total, useDefaultUsername) {
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);

  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});

  let signupResponseData = null;
  let allocatedAmount = 0;

  page.on('response', async (res) => {
    if (res.url().includes('/v1/auth/signup') && res.request().method() === 'POST') {
      try { signupResponseData = await res.json(); } catch (_) {}
    }
    if (res.url().includes('/v1/account/allocate') && res.request().method() === 'POST') {
      try {
        const data = await res.json();
        allocatedAmount = data.allocated || data.amount || 0;
      } catch (_) {}
    }
  });

  try {
    await page.goto('https://inference.dahl.global/account', { waitUntil: 'networkidle2' });

    await page.waitForFunction(
      () => document.querySelector('input#signin-fingerprint') !== null || document.body.innerText.toLowerCase().includes('welcome back'),
      { timeout: 0 }
    );

    await clickVisibleButtonByText(page, 'Create account');

    await waitForVisible(page, 'input#signup-username');

    const setUsername = async (name) => {
      const input = await page.$('input#signup-username');
      await input.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await input.evaluate((el) => { el.value = ''; });
      await input.type(name, { delay: 50 });
    };

    if (!useDefaultUsername) {
      await setUsername(generateRandomUsername());
    }

    let usernameReady = false;
    while (!usernameReady) {
      await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
      await delay(500);

      const isTaken = await page.evaluate(() => {
        const body = document.body.innerText.toLowerCase();
        return body.includes('taken') || body.includes('already in use');
      });

      if (isTaken) {
        await setUsername(generateRandomUsername());
      } else {
        usernameReady = true;
      }
    }

    await waitForButtonByText(page, 'Create account');
    const submitBtn = await page.waitForSelector('button[type="submit"]', { visible: true });
    await submitBtn.click();

    const signupSuccess = await Promise.race([
      page.waitForFunction(
        () => {
          const body = document.body.innerText.toLowerCase();
          return body.includes('fingerprint') || document.querySelector('input[type="checkbox"]') !== null;
        },
        { timeout: 0 }
      ).then(() => true),
      delay(120000).then(() => false)
    ]);

    if (!signupSuccess) {
      console.log(`${RED_BG} [${index}/${total}] GAGAL - timeout 2 menit, fingerprint tidak muncul ${RESET}`);
      return false;
    }

    await delay(1000);

    if (!signupResponseData) {
      console.log(`${RED_BG} [${index}/${total}] GAGAL - response signup tidak tertangkap ${RESET}`);
      return false;
    }

    const checkbox = await page.$('input[type="checkbox"]');
    if (checkbox) {
      await checkbox.click();
      await delay(500);
    }

    await waitForButtonByText(page, 'continue');
    await clickVisibleButtonByText(page, 'continue');

    await page.waitForFunction(
      () => {
        const body = document.body.innerText.toLowerCase();
        return body.includes('api key') || body.includes('balance') || body.includes('allocate');
      },
      { timeout: 0 }
    );

    await waitForButtonByText(page, 'allocate');
    await delay(1000);

    const allocateClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => {
        const text = b.textContent.trim().toLowerCase();
        return text.includes('allocate') && b.offsetParent !== null && !b.disabled;
      });
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (!allocateClicked) {
      allocatedAmount = await allocateViaAPI(page, signupResponseData);
    } else {
      await delay(2000);

      await waitForButtonByText(page, 'max');
      const maxClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find((b) => {
          const text = b.textContent.trim().toLowerCase();
          return (text === 'max' || text.includes('max')) && b.offsetParent !== null;
        });
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (!maxClicked) {
        const amountInput = await page.$('input[autocomplete="off"]');
        if (amountInput) {
          await amountInput.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await amountInput.type('100M', { delay: 50 });
        }
      }

      await delay(1000);

      const confirmClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const candidates = btns.filter((b) => {
          const text = b.textContent.trim().toLowerCase();
          return text === 'allocate' && b.offsetParent !== null && !b.disabled;
        });
        const confirmBtn = candidates[candidates.length - 1];
        if (confirmBtn) { confirmBtn.click(); return true; }
        return false;
      });

      if (!confirmClicked) {
        allocatedAmount = await allocateViaAPI(page, signupResponseData);
      } else {
        await delay(2000);
      }
    }

    await delay(1000);
    const actualAllocated = await page.evaluate(async () => {
      try {
        const res = await fetch('/v1/account/keys', { credentials: 'include' });
        const data = await res.json();
        const keys = data.keys || data || [];
        if (Array.isArray(keys) && keys.length > 0) {
          return keys[0].total_tokens || keys[0].allocated || 0;
        }
        return 0;
      } catch (_) { return 0; }
    });
    if (actualAllocated > 0) allocatedAmount = actualAllocated;

    const fingerprint = signupResponseData.fingerprint;
    const allocated = allocatedAmount || 0;
    const formatTokens = (n) => n >= 1e6 ? (n / 1e6) + 'M' : n >= 1e3 ? (n / 1e3) + 'K' : String(n);

    const akunPath = path.join(__dirname, 'akun.txt');
    fs.appendFileSync(akunPath, `${fingerprint}|${signupResponseData.api_key?.token}\n`);

    console.log(`${GREEN_BG} [${index}/${total}] ${fingerprint} => ${formatTokens(allocated)} | sukses ${RESET}`);
    return true;
  } catch (err) {
    console.log(`${RED_BG} [${index}/${total}] GAGAL - ${err.message} ${RESET}`);
    return false;
  } finally {
    await page.close();
  }
}

async function allocateViaAPI(page, signupData) {
  if (!signupData?.api_key) return 0;

  const result = await page.evaluate(async (keyId) => {
    try {
      const accRes = await fetch('/v1/account', { credentials: 'include' });
      const accData = await accRes.json();
      const poolTokens = accData.pool_tokens || accData.balance || 0;
      if (poolTokens <= 0) return 0;
      await fetch('/v1/account/allocate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId, amount: poolTokens })
      });
      return poolTokens;
    } catch (_) { return 0; }
  }, signupData.api_key.id || signupData.api_key.key_id);

  return result;
}

async function main() {
  const modeInput = await askQuestion('Mode browser? (1: Headless, 2: Tampilkan browser): ');
  const useHeadless = modeInput.trim() !== '2';

  const usernameInput = await askQuestion('Username? (1: Bawaan website, 2: Random): ');
  const useDefaultUsername = usernameInput.trim() !== '2';

  const input = await askQuestion('Berapa akun yang ingin dibuat? ');
  const total = parseInt(input, 10);

  if (!total || total < 1) {
    console.log('Jumlah tidak valid.');
    return;
  }

  console.log(`\nMode: ${useHeadless ? 'Headless' : 'Browser tampil'}`);
  console.log(`Membuat ${total} akun...\n`);

  const browser = await puppeteer.launch({
    headless: useHeadless,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--start-maximized']
  });

  let sukses = 0;
  let gagal = 0;

  for (let i = 1; i <= total; i++) {
    const result = await createSingleAccount(browser, i, total, useDefaultUsername);
    if (result) sukses++;
    else gagal++;
  }

  await browser.close();

  console.log(`\n===========================`);
  console.log(`Sukses: ${sukses} | Gagal: ${gagal} | Total: ${total}`);
  console.log(`===========================`);
}

main();
