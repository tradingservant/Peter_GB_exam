import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(fs.readFileSync(path.join(root, "data/exercises.json"), "utf8"));
const MODEL_SNIPPETS = [
  "If it is fine on Saturday, I will play football in the park.",
  "If I were a pilot, I would fly over Hong Kong.",
  "範例／教師用",
  "Suggested model"
];

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/favicon.ico" || urlPath === "/Peter_GB_exam/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    const prefix = "/Peter_GB_exam";
    if (urlPath === prefix || urlPath.startsWith(prefix + "/")) {
      urlPath = urlPath.slice(prefix.length) || "/";
    }
    if (urlPath.endsWith("/")) {
      urlPath += "index.html";
    }
    const relative = urlPath.replace(/^\/+/, "");
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      const types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
      };
      res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(data);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function stationById(id) {
  return pack.stations.find((station) => station.id === id);
}

function questionById(id) {
  for (const station of pack.stations) {
    for (const item of station.questions) {
      if (item.id === id) {
        return item;
      }
    }
  }
  throw new Error("missing " + id);
}

async function clickExact(page, label) {
  const found = await page.waitForFunction((text) => {
    return [...document.querySelectorAll("button")].some((button) => {
      return button.textContent.trim() === text && !button.disabled;
    });
  }, { timeout: 8000 }, label).then(() => true).catch(() => false);
  if (!found) {
    const labels = await page.$$eval("button", (buttons) => buttons.map((button) => button.textContent.trim()));
    throw new Error("Button not found: " + label + " visible: " + labels.join(" | "));
  }
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === text && !item.disabled);
    button.click();
  }, label);
}

async function openPractice(page) {
  await page.goto(page.basePractice, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-screen-id="S1-T1"]');
  await page.waitForFunction(() => window.GBMarking && typeof window.GBMarking.normalizeAnswer === "function");
}

async function assertScreen(page, screen) {
  await page.waitForSelector('[data-screen-id="' + screen.id + '"]');
  for (const field of ["title_zh", "title_en", "body_zh", "body_en"]) {
    const value = await page.$eval('[data-screen-id="' + screen.id + '"] [data-field="' + field + '"]', (node) => node.textContent);
    assert.equal(value, screen[field], screen.id + " " + field);
  }
  const examples = await page.$$eval('[data-screen-id="' + screen.id + '"] .example', (nodes) => {
    return nodes.map((node) => ({
      en: node.querySelector('[data-field="en"]').textContent,
      en_alt: node.querySelector('[data-field="en_alt"]') ? node.querySelector('[data-field="en_alt"]').textContent : null,
      note_zh: node.querySelector('[data-field="note_zh"]') ? node.querySelector('[data-field="note_zh"]').textContent : null,
      height: node.getBoundingClientRect().height
    }));
  });
  assert.equal(examples.length, screen.examples.length, screen.id);
  screen.examples.forEach((example, index) => {
    assert.equal(examples[index].en, example.en, screen.id + " example " + index);
    assert.equal(examples[index].en_alt, example.en_alt || null);
    assert.equal(examples[index].note_zh, example.note_zh || null);
    assert.ok(examples[index].height > 0, screen.id + " example hidden");
  });
  assert.equal(await page.$("[data-question-id]"), null);
}

async function passScreens(page, station) {
  for (const screen of station.teaching_screens) {
    await assertScreen(page, screen);
    await clickExact(page, "下一頁");
  }
  await page.waitForSelector('[data-phase="intro"]');
  const intro = await page.$eval('[data-field="intro_zh"]', (node) => node.textContent);
  const introEn = await page.$eval('[data-field="intro_en"]', (node) => node.textContent);
  assert.equal(intro, station.intro_zh);
  assert.equal(introEn, station.intro_en);
  assert.equal(await page.$("[data-question-id]"), null);
}

async function startQuestions(page) {
  await clickExact(page, "開始作答");
  await page.waitForSelector("[data-question-id]");
}

async function openStation(page, id) {
  await page.evaluate((stationId) => {
    document.querySelector('#station-menu button[data-station-id="' + stationId + '"]').click();
  }, id);
  const station = stationById(id);
  if (station.teaching_screens.length) {
    await page.waitForSelector('[data-screen-id="' + station.teaching_screens[0].id + '"]');
  } else {
    await page.waitForSelector('[data-phase="intro"]');
  }
  return station;
}

async function openQuestion(page, stationId, questionId) {
  await page.evaluate((id) => {
    document.querySelector('#station-menu button[data-station-id="' + id + '"]').click();
  }, stationId);
  await page.waitForFunction((id) => document.querySelector("#main") && document.querySelector("#main").getAttribute("data-station-id") === id, {}, stationId);
  let phase = await page.$eval("#main", (node) => node.getAttribute("data-phase"));
  if (phase === "teaching") {
    const total = Number(await page.$eval("[data-screen-total]", (node) => node.getAttribute("data-screen-total")));
    const index = Number(await page.$eval("[data-screen-index]", (node) => node.getAttribute("data-screen-index")));
    const clicks = total - index + 1;
    for (let step = 0; step < clicks; step += 1) {
      await clickExact(page, "下一頁");
    }
    phase = await page.$eval("#main", (node) => node.getAttribute("data-phase"));
  }
  if (phase === "intro") {
    await startQuestions(page);
  } else if (phase === "done") {
    await clickExact(page, "檢視題目");
  }
  await page.waitForSelector("[data-question-jump]");
  await page.evaluate((id) => {
    document.querySelector('[data-question-jump="' + id + '"]').click();
  }, questionId);
  await page.waitForSelector('[data-question-id="' + questionId + '"]');
}

async function score(page) {
  return page.$eval("#scoreboard", (node) => ({
    first: node.getAttribute("data-first-correct"),
    retry: node.getAttribute("data-retry-correct"),
    pending: node.getAttribute("data-teacher-pending"),
    auto: node.getAttribute("data-auto-total"),
    teacher: node.getAttribute("data-teacher-total"),
    total: node.getAttribute("data-question-total"),
    text: node.textContent
  }));
}

async function submitGap(page, value) {
  await page.evaluate((text) => {
    const input = document.querySelector("#gap-answer");
    input.value = text;
  }, value);
  await clickExact(page, "提交");
}

async function submitWriting(page, value) {
  await page.evaluate((text) => {
    document.querySelector("#writing-answer").value = text;
  }, value);
  await clickExact(page, "提交");
}

async function assertNoStorage(page, traffic) {
  const writes = await page.evaluate(() => ({
    writes: window.__writes || [],
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie
  }));
  assert.deepEqual(writes.writes, []);
  assert.equal(writes.local, 0);
  assert.equal(writes.session, 0);
  assert.equal(writes.cookie, "");
  assert.deepEqual(traffic.posts, []);
  assert.deepEqual(traffic.external, []);
}

async function layoutReport(page) {
  return page.evaluate(() => {
    const font = (node) => node ? parseFloat(getComputedStyle(node).fontSize) : null;
    const finger = [...document.querySelectorAll("button, .option, input[type='text'], textarea")].map((node) => ({
      tag: node.tagName,
      text: (node.textContent || node.getAttribute("aria-label") || "").trim().slice(0, 40),
      height: node.getBoundingClientRect().height,
      font: font(node)
    }));
    return {
      body: font(document.body),
      button: font(document.querySelector("button")),
      option: font(document.querySelector(".option")),
      input: font(document.querySelector("input[type='text'], textarea")),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      finger
    };
  });
}

function assertLayout(report, label) {
  assert.ok(report.body >= 18, label + " body " + report.body);
  assert.ok(report.button >= 18, label + " button " + report.button);
  if (report.option != null) {
    assert.ok(report.option >= 18, label + " option " + report.option);
  }
  if (report.input != null) {
    assert.ok(report.input >= 18, label + " input " + report.input);
  }
  assert.ok(report.overflow <= 1, label + " overflow " + JSON.stringify(report));
  report.finger.forEach((item) => {
    assert.ok(item.font >= 18, label + " font " + JSON.stringify(item));
    assert.ok(item.height >= 44, label + " target " + JSON.stringify(item));
  });
}

async function run() {
  const server = await startServer();
  const port = server.address().port;
  const base = "http://127.0.0.1:" + port + "/Peter_GB_exam/";
  let browser;
  let failed = 0;
  const results = [];

  async function check(name, fn) {
    try {
      await fn();
      results.push("PASS " + name);
      console.log("PASS " + name);
    } catch (error) {
      failed += 1;
      results.push("FAIL " + name);
      console.error("FAIL " + name);
      console.error(error);
    }
  }

  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/local/bin/google-chrome",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-translate",
        "--no-first-run",
        "--disable-component-update"
      ]
    });

    async function withPage(viewport, fn) {
      const page = await browser.newPage();
      page.basePractice = base;
      const traffic = { posts: [], external: [] };
      await page.evaluateOnNewDocument(() => {
        window.__writes = [];
        const record = (entry) => window.__writes.push(entry);
        const originalSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          record({ kind: "storage", key: String(key) });
          return originalSet.apply(this, arguments);
        };
        const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
        Object.defineProperty(Document.prototype, "cookie", {
          configurable: true,
          get() {
            return cookie.get.call(this);
          },
          set(value) {
            record({ kind: "cookie", value: String(value) });
            return cookie.set.call(this, value);
          }
        });
        if (window.indexedDB && indexedDB.open) {
          const originalOpen = indexedDB.open.bind(indexedDB);
          indexedDB.open = function () {
            record({ kind: "indexedDB" });
            return originalOpen.apply(indexedDB, arguments);
          };
        }
        if (navigator.sendBeacon) {
          const originalBeacon = navigator.sendBeacon.bind(navigator);
          navigator.sendBeacon = function () {
            record({ kind: "beacon", url: String(arguments[0]) });
            return originalBeacon.apply(navigator, arguments);
          };
        }
        if (navigator.serviceWorker && navigator.serviceWorker.register) {
          const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = function () {
            record({ kind: "serviceWorker" });
            return originalRegister.apply(navigator.serviceWorker, arguments);
          };
        }
      });
      page.on("request", (request) => {
        const url = request.url();
        const method = request.method();
        if (method !== "GET" && method !== "HEAD") {
          traffic.posts.push(method + " " + url);
        }
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch (error) {
          host = "";
        }
        const type = request.resourceType();
        const watched = type === "document" || type === "script" || type === "stylesheet" || type === "fetch" || type === "xhr" || type === "ping";
        if (watched && host && host !== "127.0.0.1" && host !== "localhost") {
          traffic.external.push(type + " " + url);
        }
      });
      page.setDefaultTimeout(15000);
      if (viewport) {
        await page.setViewport(viewport);
      }
      try {
        await fn(page, traffic);
      } finally {
        await page.close();
      }
    }

    await check("nested path loads stylesheet and pack counts", async () => {
      const response = await fetch(base);
      const html = await response.text();
      assert.match(html, /href="css\/styles\.css"/);
      assert.doesNotMatch(html, /href="\/css\//);
      await withPage({ width: 1280, height: 800 }, async (page, traffic) => {
        const seen = [];
        page.on("request", (request) => seen.push(request.url()));
        await openPractice(page);
        const href = await page.$eval('link[rel="stylesheet"]', (node) => node.getAttribute("href"));
        const absolute = await page.$eval('link[rel="stylesheet"]', (node) => node.href);
        assert.equal(href, "css/styles.css");
        assert.ok(absolute.includes("/Peter_GB_exam/css/styles.css"), absolute);
        assert.ok(seen.some((url) => url.includes("/Peter_GB_exam/data/exercises.json")));
        assert.ok(seen.some((url) => url.includes("/Peter_GB_exam/css/styles.css")));
        const counts = await page.$$eval("#station-menu button", (buttons) => buttons.map((button) => ({
          id: button.getAttribute("data-station-id"),
          count: button.getAttribute("data-question-count")
        })));
        assert.deepEqual(counts, [
          { id: "S1", count: "8" },
          { id: "S2", count: "7" },
          { id: "S3", count: "7" },
          { id: "S4", count: "7" },
          { id: "S5", count: "7" }
        ]);
        const totals = await score(page);
        assert.equal(totals.auto, "35");
        assert.equal(totals.teacher, "1");
        assert.equal(totals.total, "36");
        assert.equal(totals.first, "0");
        assert.equal(totals.pending, "0");
        assert.match(totals.text, /首次答對：0／35/);
        assert.match(totals.text, /待教師審閱：0／1/);
        assert.match(await page.$eval("#memory-note", (node) => node.textContent), /重新開始/);
        assert.match(await page.$eval("#memory-note", (node) => node.textContent), /重新載入/);
        await assertNoStorage(page, traffic);
      });
    });

    await check("teaching and recap screens appear before questions", async () => {
      await withPage({ width: 1280, height: 800 }, async (page) => {
        await openPractice(page);
        await passScreens(page, stationById("S1"));
        await startQuestions(page);
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-question-id")), "S1-Q01");
        const prompt = questionById("S1-Q01").prompt;
        assert.equal(await page.$eval('[data-field="prompt"]', (node) => node.textContent), prompt);
        assert.equal(await page.$('[data-field="hint"]'), null);
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-hint-visible")), "false");

        for (const id of ["S2", "S3", "S4"]) {
          const station = await openStation(page, id);
          await assertScreen(page, station.teaching_screens[0]);
          const nextButtons = await page.$$eval("button", (buttons) => buttons.map((button) => button.textContent.trim()));
          assert.ok(nextButtons.includes("下一頁"));
          assert.equal(await page.$("[data-question-id]"), null);
          await clickExact(page, "下一頁");
          await page.waitForSelector('[data-phase="intro"]');
          assert.equal(await page.$eval('[data-field="intro_zh"]', (node) => node.textContent), station.intro_zh);
          await startQuestions(page);
          assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-question-id")), id + "-Q01");
        }

        await openStation(page, "S5");
        assert.equal(await page.$("[data-screen-id]"), null);
        assert.equal(await page.$eval("[data-phase]", (node) => node.getAttribute("data-phase")), "intro");
        const labels = await page.$$eval("button", (buttons) => buttons.map((button) => button.textContent.trim()));
        assert.equal(labels.includes("下一頁"), false);
        assert.equal(labels.includes("返回教學說明"), false);
        assert.equal(await page.$eval('[data-field="intro_zh"]', (node) => node.textContent), stationById("S5").intro_zh);
        await startQuestions(page);
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-question-id")), "S5-Q01");
      });
    });

    await check("first attempt is unhinted, then a retry is not first-correct", async () => {
      await withPage({ width: 1280, height: 800 }, async (page, traffic) => {
        await openPractice(page);
        await passScreens(page, stationById("S1"));
        await startQuestions(page);
        const item = questionById("S1-Q01");
        assert.equal(await page.$("[data-field='hint']"), null);
        assert.equal((await page.content()).includes(item.hints.first_error), false);
        await clickExact(page, "返回教學說明");
        await page.waitForSelector('[data-screen-id="S1-T1"]');
        await clickExact(page, "返回題目");
        await page.waitForSelector('[data-question-id="S1-Q01"]');
        assert.equal(await page.$("[data-field='hint']"), null);
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-hint-visible")), "false");
        const stemBefore = await page.$eval('[data-field="prompt"]', (node) => node.getBoundingClientRect().height);
        assert.ok(stemBefore > 0);
        await page.click('input[name="choice"][value="B"]');
        await clickExact(page, "提交");
        await page.waitForSelector('[data-field="hint"]');
        assert.equal(await page.$eval('[data-field="hint"]', (node) => node.textContent), item.hints.first_error);
        assert.equal(await page.$('[data-field="feedback-explanatory"]'), null);
        assert.equal(await page.$('[data-field="feedback-correct"]'), null);
        assert.equal(await page.$(".is-key"), null);
        const bodyAfterWrong = await page.$eval("#main", (node) => node.innerText);
        assert.equal(bodyAfterWrong.includes(item.feedback.explanatory), false);
        assert.equal(bodyAfterWrong.includes(item.feedback.correct), false);
        assert.equal(bodyAfterWrong.includes("正確選項"), false);
        assert.equal(await page.$eval('[data-field="prompt"]', (node) => node.textContent), item.prompt);
        assert.ok((await page.$eval('[data-field="prompt"]', (node) => node.getBoundingClientRect().height)) > 0);
        assert.equal((await page.$$(".option")).length, item.options.length);
        let totals = await score(page);
        assert.equal(totals.first, "0");
        assert.equal(totals.retry, "0");
        await page.click('input[name="choice"][value="A"]');
        await clickExact(page, "提交");
        await page.waitForSelector('[data-field="feedback-explanatory"]');
        assert.equal(await page.$eval('[data-field="feedback-explanatory"]', (node) => node.textContent), item.feedback.explanatory);
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-first-result")), "incorrect");
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-retry-correct")), "true");
        assert.equal(await page.$eval('[data-field="status-retry"]', (node) => node.textContent), "提示後答對（不計入首次答對）。");
        totals = await score(page);
        assert.equal(totals.first, "0");
        assert.equal(totals.retry, "1");
        assert.match(totals.text, /不計入首次答對/);
        await assertNoStorage(page, traffic);
      });
    });

    await check("keyboard can select an option and submit", async () => {
      await withPage({ width: 1280, height: 800 }, async (page) => {
        await openPractice(page);
        await passScreens(page, stationById("S1"));
        await startQuestions(page);
        await page.focus('input[name="choice"][value="C"]');
        await page.keyboard.press("Space");
        await page.focus('button[type="submit"]');
        await page.keyboard.press("Enter");
        await page.waitForSelector('[data-field="hint"]');
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-first-result")), "incorrect");
        assert.equal(await page.$("[data-field='feedback-explanatory']"), null);
      });
    });

    await check("rejected variants do not pass and contractions do", async () => {
      await withPage({ width: 1280, height: 900 }, async (page) => {
        await openPractice(page);
        const browserPairs = await page.evaluate(() => {
          const pairs = [
            ["I'll stay", "I will stay"],
            ["I'd go", "I would go"],
            ["won't go", "will not go"],
            ["don't go", "do not go"],
            ["doesn't like", "does not like"],
            ["isn't open", "is not open"],
            ["aren't ready", "are not ready"],
            ["shouldn't go", "should not go"]
          ];
          return pairs.map(([left, right]) => ({
            left,
            right,
            same: window.GBMarking.normalizeAnswer(left) === window.GBMarking.normalizeAnswer(right)
          }));
        });
        browserPairs.forEach((pair) => {
          assert.equal(pair.same, true, pair.left);
        });
        const curly = await page.evaluate(() => {
          return window.GBMarking.normalizeAnswer("I’d go") === window.GBMarking.normalizeAnswer("I would go")
            && window.GBMarking.matchesAccepted("I'll help.", ["I will help"])
            && window.GBMarking.matchesAccepted("we will cancel", ["we'll cancel", "will cancel"]) === false;
        });
        assert.equal(curly, true);

        async function expectWrongThen(questionId, stationId, wrong, right) {
          await openQuestion(page, stationId, questionId);
          const item = questionById(questionId);
          assert.equal(await page.$("[data-field='hint']"), null);
          const stem = await page.$eval('[data-field="prompt"]', (node) => node.getBoundingClientRect().toJSON());
          await submitGap(page, wrong);
          await page.waitForSelector('[data-field="hint"]');
          assert.equal(await page.$eval('[data-field="hint"]', (node) => node.textContent), item.hints.first_error);
          assert.equal(await page.$("[data-field='feedback-explanatory']"), null);
          const stemStill = await page.$eval('[data-field="prompt"]', (node) => node.getBoundingClientRect().height);
          const inputTop = await page.$eval("#gap-answer", (node) => node.getBoundingClientRect().top);
          assert.ok(stemStill > 0);
          assert.ok(inputTop > stem.top);
          if (right) {
            await submitGap(page, right);
            await page.waitForSelector('[data-field="feedback-explanatory"]');
            assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-first-result")), "incorrect");
            assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-retry-correct")), "true");
          }
        }

        await expectWrongThen("S2-Q05", "S2", "was", "were");
        await expectWrongThen("S2-Q02", "S2", "will fly", "would fly");
        await expectWrongThen("S3-Q04", "S3", "had", "have");
        await expectWrongThen("S4-Q03", "S4", "either too", "either");
        await expectWrongThen("S5-Q05", "S5", "either too", null);
        await expectWrongThen("S5-Q04", "S5", "tasty", null);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-screen-id="S1-T1"]');
        await expectWrongThen("S5-Q04", "S5", "taste", null);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-screen-id="S1-T1"]');
        await expectWrongThen("S5-Q04", "S5", "tasted", null);

        const firstCorrect = [
          ["S2", "S2-Q02", "I'd fly"],
          ["S2", "S2-Q02", "I would fly"],
          ["S2", "S2-Q02", "  I'd   fly. "],
          ["S2", "S2-Q06", "I WOULD GO!"],
          ["S3", "S3-Q03", "We'll cancel"],
          ["S3", "S3-Q03", "will cancel"],
          ["S3", "S3-Q06", "do not go"],
          ["S3", "S3-Q06", "don’t go"]
        ];
        for (const [stationId, questionId, value] of firstCorrect) {
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForSelector('[data-screen-id="S1-T1"]');
          await openQuestion(page, stationId, questionId);
          await submitGap(page, value);
          await page.waitForSelector('[data-field="feedback-correct"]');
          assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-first-result")), "correct", value);
          assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-retry-correct")), "false", value);
          const totals = await score(page);
          assert.equal(totals.first, "1", value);
          assert.equal(totals.retry, "0", value);
        }

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-screen-id="S1-T1"]');
        await openQuestion(page, "S3", "S3-Q03");
        await submitGap(page, "we will cancel");
        await page.waitForSelector('[data-field="hint"]');
        assert.equal(await page.$("[data-field='feedback-correct']"), null);
        await openQuestion(page, "S3", "S3-Q06");
        await submitGap(page, "won't go");
        await page.waitForSelector('[data-question-id="S3-Q06"] [data-field="hint"]');
        assert.equal(await page.$eval('[data-question-id="S3-Q06"]', (node) => node.getAttribute("data-first-result")), "incorrect");
      });
    });

    await check("teacher review keeps writing on screen and does not mark it", async () => {
      await withPage({ width: 1100, height: 900 }, async (page, traffic) => {
        await openPractice(page);
        await openQuestion(page, "S5", "S5-Q07");
        assert.equal(await page.$("[data-field='hint']"), null);
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-auto-marked")), "false");
        const model = await page.evaluate((snippets) => {
          const text = document.body.innerText;
          return snippets.filter((snippet) => text.includes(snippet));
        }, MODEL_SNIPPETS);
        assert.deepEqual(model, []);
        await submitWriting(page, "   ");
        assert.equal(await page.$("[data-field='teacher-status']"), null);
        assert.ok((await page.$eval("#main", (node) => node.innerText)).includes("請先寫下內容"));
        const writings = [
          "Mr.",
          "Mr Brown",
          "Mr. Brown met Mr. Lee today. If it is sunny, I will play. If I were Mr. Brown, I would help. I like Maths too."
        ];
        for (const writing of writings) {
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForSelector('[data-screen-id="S1-T1"]');
          await openQuestion(page, "S5", "S5-Q07");
          await submitWriting(page, writing);
          await page.waitForSelector('[data-field="teacher-status"]');
          assert.equal(await page.$eval('[data-field="teacher-status"]', (node) => node.textContent), questionById("S5-Q07").feedback.correct);
          assert.match(await page.$eval('[data-field="teacher-status"]', (node) => node.textContent), /已提交，請交教師審閱/);
          assert.equal(await page.$eval('[data-field="pupil-text"]', (node) => node.textContent), writing);
          assert.equal(await page.$("[data-field='feedback-explanatory']"), null);
          assert.equal(await page.$("[data-field='hint']"), null);
          assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-mastery")), "false");
          assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-teacher-submitted")), "true");
          assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-first-result")), "");
          const totals = await score(page);
          assert.equal(totals.first, "0");
          assert.equal(totals.retry, "0");
          assert.equal(totals.pending, "1");
          const leaked = await page.evaluate((snippets) => {
            const text = document.body.innerText;
            return snippets.filter((snippet) => text.includes(snippet));
          }, MODEL_SNIPPETS);
          assert.deepEqual(leaked, []);
          assert.equal((await page.$eval("#main", (node) => node.innerText)).includes("accept_notes"), false);
        }
        await assertNoStorage(page, traffic);
      });
    });

    await check("all 36 items can be answered and corrected feedback letters stay exact", async () => {
      await withPage({ width: 1280, height: 900 }, async (page, traffic) => {
        await openPractice(page);
        const writing = "Mr. Brown said hello. If the bus is late, I will wait. If I were Mr Brown, I would bring a map. I like colour.";
        for (let stationIndex = 0; stationIndex < pack.stations.length; stationIndex += 1) {
          const station = pack.stations[stationIndex];
          if (stationIndex === 0) {
            await passScreens(page, station);
          } else if (station.teaching_screens.length) {
            await openStation(page, station.id);
            await passScreens(page, station);
          } else {
            await openStation(page, station.id);
            await page.waitForSelector('[data-phase="intro"]');
            assert.equal(await page.$("[data-screen-id]"), null);
          }
          await startQuestions(page);
          for (let index = 0; index < station.questions.length; index += 1) {
            const item = station.questions[index];
            await page.waitForSelector('[data-question-id="' + item.id + '"]');
            assert.equal(await page.$eval('[data-field="prompt"]', (node) => node.textContent), item.prompt);
            assert.equal(await page.$eval('[data-field="prompt_zh"]', (node) => node.textContent), item.prompt_zh);
            assert.equal(await page.$("[data-field='hint']"), null);
            if (item.type === "mcq") {
              const texts = await page.$$eval('[data-field="option-text"]', (nodes) => nodes.map((node) => node.textContent));
              const ids = await page.$$eval('input[name="choice"]', (nodes) => nodes.map((node) => node.value));
              assert.deepEqual(texts, item.options.map((option) => option.text));
              assert.deepEqual(ids, item.options.map((option) => option.id));
              const stemTop = await page.$eval('[data-field="prompt"]', (node) => node.getBoundingClientRect().top);
              const optionTop = await page.$eval(".option", (node) => node.getBoundingClientRect().top);
              assert.ok(optionTop > stemTop);
              await page.evaluate((optionId) => {
                document.querySelector('input[name="choice"][value="' + optionId + '"]').checked = true;
              }, item.correct_option_id);
              await clickExact(page, "提交");
            } else if (item.type === "gap") {
              const stemTop = await page.$eval('[data-field="prompt"]', (node) => node.getBoundingClientRect().top);
              const inputTop = await page.$eval("#gap-answer", (node) => node.getBoundingClientRect().top);
              assert.ok(inputTop > stemTop);
              await submitGap(page, item.accepted_answers[0]);
            } else {
              await submitWriting(page, writing);
            }
            await page.waitForFunction((id) => {
              const node = document.querySelector('[data-question-id="' + id + '"]');
              return node && node.getAttribute("data-finalized") === "true";
            }, {}, item.id);
            if (item.type === "teacher_review") {
              assert.equal(await page.$eval('[data-field="pupil-text"]', (node) => node.textContent), writing);
              assert.match(await page.$eval('[data-field="teacher-status"]', (node) => node.textContent), /已提交，請交教師審閱/);
              assert.equal(await page.$("[data-field='feedback-explanatory']"), null);
              assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-mastery")), "false");
              const leaked = await page.evaluate((snippets) => document.body.innerText, MODEL_SNIPPETS);
              MODEL_SNIPPETS.forEach((snippet) => {
                assert.equal(leaked.includes(snippet), false, snippet);
              });
            } else {
              assert.equal(await page.$eval('[data-field="feedback-explanatory"]', (node) => node.textContent), item.feedback.explanatory, item.id);
              assert.equal(await page.$eval('[data-field="feedback-correct"]', (node) => node.textContent), item.feedback.correct, item.id);
              assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-first-result")), "correct", item.id);
              if (item.accept_notes) {
                const visible = await page.$eval("#main", (node) => node.innerText);
                assert.equal(visible.includes(item.accept_notes), false, item.id);
              }
            }
            if (index < station.questions.length - 1) {
              await clickExact(page, "下一題");
            } else {
              await clickExact(page, "完成本關");
              await page.waitForSelector('[data-screen="done"]');
              if (stationIndex < pack.stations.length - 1) {
                await clickExact(page, "下一關");
              }
            }
          }
        }
        const totals = await score(page);
        assert.equal(totals.first, "35");
        assert.equal(totals.retry, "0");
        assert.equal(totals.pending, "1");
        assert.equal(totals.auto, "35");
        assert.equal(totals.total, "36");
        await assertNoStorage(page, traffic);
      });
    });

    await check("reset and reload clear memory scores", async () => {
      await withPage({ width: 1280, height: 800 }, async (page, traffic) => {
        await openPractice(page);
        await openQuestion(page, "S5", "S5-Q01");
        await page.evaluate(() => {
          document.querySelector('input[name="choice"][value="D"]').checked = true;
        });
        await clickExact(page, "提交");
        await page.waitForSelector('[data-field="feedback-correct"]');
        assert.equal((await score(page)).first, "1");
        await clickExact(page, "重新開始");
        await page.waitForSelector('[data-screen-id="S1-T1"]');
        assert.equal((await score(page)).first, "0");
        assert.equal((await score(page)).retry, "0");
        assert.equal((await score(page)).pending, "0");
        assert.equal(await page.$("[data-question-id]"), null);
        await openQuestion(page, "S5", "S5-Q01");
        assert.equal(await page.$eval("[data-question-id]", (node) => node.getAttribute("data-finalized")), "false");
        assert.equal(await page.$("[data-field='hint']"), null);
        await page.evaluate(() => {
          document.querySelector('input[name="choice"][value="D"]').checked = true;
        });
        await clickExact(page, "提交");
        await page.waitForSelector('[data-first-result="correct"]');
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-screen-id="S1-T1"]');
        assert.equal((await score(page)).first, "0");
        assert.equal((await score(page)).pending, "0");
        assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length), 0);
        await assertNoStorage(page, traffic);
      });
    });

    await check("414px and desktop type stays readable without overflow", async () => {
      for (const viewport of [
        { width: 414, height: 896, label: "414" },
        { width: 1280, height: 800, label: "desktop" }
      ]) {
        await withPage(viewport, async (page) => {
          await openPractice(page);
          await clickExact(page, "下一頁");
          await page.waitForSelector('[data-screen-id="S1-T2"]');
          assertLayout(await layoutReport(page), viewport.label + " teaching");
          await openQuestion(page, "S4", "S4-Q05");
          assertLayout(await layoutReport(page), viewport.label + " options");
          await openQuestion(page, "S5", "S5-Q04");
          assertLayout(await layoutReport(page), viewport.label + " gap");
          await openQuestion(page, "S5", "S5-Q07");
          await page.evaluate(() => {
            document.querySelector("#writing-answer").value = "Mr. Brown ".repeat(30) + "If it rains, I will read.";
          });
          assertLayout(await layoutReport(page), viewport.label + " writing");
        });
      }
    });
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
  }

  if (failed) {
    console.error(results.join("\n"));
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
