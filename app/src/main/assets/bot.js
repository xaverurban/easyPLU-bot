/* =====================================================================
 * bot.js - easyPLU automation engine (Android WebView port)
 * =====================================================================
 * This is the JavaScript equivalent of bot_core.py. It runs inside the
 * easyPLU page and drives it directly through the DOM.
 *
 * Android calls:   EasyPLUBot.start('learn' | 'test' | 'one_of_four' | 'check_level')
 *                  EasyPLUBot.stop()
 *                  EasyPLUBot.setCodes(jsonString)
 *                  EasyPLUBot.provideCode(code)     // answer to askUser
 *
 * JS calls back:   AndroidBridge.log(text)
 *                  AndroidBridge.progress(current, total)
 *                  AndroidBridge.saveCode(name, code)
 *                  AndroidBridge.requestCode(name)  // prompts the user
 *                  AndroidBridge.finished()
 * ===================================================================== */

(function () {
  "use strict";

  if (window.EasyPLUBot && window.EasyPLUBot.__ready) return;

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------
  var DASHBOARD_URL = "https://easy-plu.knowledge-hero.com/dashboard";
  var PAUSE_BETWEEN_Q = 900;      // ms between questions
  var MAX_TEST_ROUNDS = 20;

  var SKIP_PHRASES = [
    "plu-test", "plu test", "leave plu-test", "leave plu test",
    "cancel", "bundle", "receipt abort", "guest",
    "plu check level mode starts right away.",
    "tasks", "check", "learning", "one of four", "plu check level",
    "exit check level mode", "your rank in store", "your total gold plus",
    "plu knowledge", "store knowledge", "plu number search",
    "your result", "overall stats", "next round", "dashboard",
    "correct", "incorrect", "go to test", "start plu test",
    "plu learning mode", "plu check level mode",
    "train plu", "by number", "by title", "fasttrack",
    "all without goldplu", "all available", "vegetables", "bake-off",
    "select plu number quantity", "choose training method",
    "choose number of plu numbers", "include products with an ean",
    "exit one of four", "systemsprache", "anmelden", "passwort"
  ];

  var pluCodes = {};       // name -> code
  var stopRequested = false;
  var running = false;
  var pendingCodeResolve = null;

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------
  function log(msg) {
    try { AndroidBridge.log(String(msg)); } catch (e) { console.log(msg); }
  }
  function reportProgress(cur, total) {
    try { AndroidBridge.progress(cur, total); } catch (e) {}
  }
  function saveCode(name, code) {
    pluCodes[name] = code;
    try { AndroidBridge.saveCode(name, code); } catch (e) {}
  }
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }
  function norm(s) {
    return (s || "").trim().toLowerCase();
  }
  function isSkip(text) {
    var low = norm(text);
    for (var i = 0; i < SKIP_PHRASES.length; i++) {
      if (low.indexOf(SKIP_PHRASES[i]) !== -1) return true;
    }
    return false;
  }
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var st = window.getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
  }
  /** Direct text of an element, ignoring child elements. */
  function ownText(el) {
    var t = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.nodeValue;
    }
    return t.trim();
  }
  /** All visible elements whose own text matches a predicate. */
  function findByText(pred, root) {
    var out = [];
    var all = (root || document).querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var t = ownText(el);
      if (!t) continue;
      if (!visible(el)) continue;
      if (pred(t, el)) out.push(el);
    }
    return out;
  }
  function findText(needle, exact) {
    var n = norm(needle);
    return findByText(function (t) {
      var tn = norm(t);
      return exact ? tn === n : tn.indexOf(n) !== -1;
    });
  }
  function clickText(needle, exact) {
    var els = findText(needle, exact);
    if (els.length) {
      // Prefer a clickable ancestor if the text sits in a plain span
      var el = els[0];
      var target = el.closest("button, a, [role='button']") || el;
      target.click();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // PLU code lookup (mirrors find_plu in bot_core.py)
  // ------------------------------------------------------------------
  function findPlu(itemName) {
    var item = norm(itemName);
    if (!item || isSkip(item)) return null;

    // Exact match
    for (var k in pluCodes) {
      if (norm(k) === item) return pluCodes[k] || null;
    }
    // Partial: screen name contains a known key. Prefer the longest key.
    var best = null, bestLen = -1;
    for (var k2 in pluCodes) {
      var kn = norm(k2);
      if (kn && item.indexOf(kn) !== -1 && kn.length > bestLen) {
        best = pluCodes[k2];
        bestLen = kn.length;
      }
    }
    return best || null;
  }

  // ------------------------------------------------------------------
  // Page readers
  // ------------------------------------------------------------------
  function getItemName() {
    var selectors = [
      ".check-execute__product-name", ".check-execute__title",
      "[class*='product-name']", "[class*='productName']",
      "[class*='product_name']", "[class*='item-name']",
      "[class*='itemName']", "[class*='item_name']",
      "[class*='article-name']", "[class*='articleName']"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && visible(el)) {
        var t = el.textContent.trim();
        if (t && !isSkip(t)) return t;
      }
    }

    // Headings
    var heads = document.querySelectorAll("h2, h3, h4");
    for (var j = 0; j < heads.length; j++) {
      var ht = heads[j].textContent.trim();
      if (ht.length > 2 && visible(heads[j]) && !isSkip(ht)) return ht;
    }

    // Fallback scan: used by 'One of Four', where the name sits in a
    // plain bar under the image with no class or heading tag.
    var cands = findByText(function (t) {
      if (t.length < 3 || t.length > 60) return false;
      if (/^\s*\d+\s*\/\s*\d+\s*$/.test(t)) return false;   // "1/100"
      if (/^[\d\s:.,\/-]+$/.test(t)) return false;          // timers, numbers
      var letters = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letters < 3) return false;
      return !isSkip(t);
    });
    return cands.length ? ownText(cands[0]) : null;
  }

  function getProgress() {
    var els = findByText(function (t) { return /^\s*\d+\s*\/\s*\d+\s*$/.test(t); });
    for (var i = 0; i < els.length; i++) {
      var m = ownText(els[i]).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (m) return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
    }
    return null;
  }

  /** In learning mode the correct PLU is already revealed in a bar. */
  function getRevealedPlu() {
    var sels = ["[class*='plu-display']", "[class*='pluDisplay']",
                "[class*='answer']", "[class*='solution']"];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && visible(el)) {
        var t = el.textContent.trim();
        if (/^\d{1,6}$/.test(t)) return t;
      }
    }
    var els = findByText(function (t) { return /^\d{1,6}$/.test(t); });
    return els.length ? ownText(els[0]) : null;
  }

  /** The four candidate answer boxes in 'One of Four'. */
  function getAnswerOptions() {
    var els = findByText(function (t) { return /^\d{1,6}$/.test(t); });
    var out = [];
    for (var i = 0; i < els.length && out.length < 4; i++) {
      out.push({ el: els[i], text: ownText(els[i]) });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Page actions
  // ------------------------------------------------------------------
  /**
   * Type a value into the PLU input. The site is a Vue app, so we set the
   * value through the native setter and dispatch real events, otherwise
   * Vue's model never sees the change.
   */
  function setInputValue(input, value) {
    var proto = window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function enterPluCode(code) {
    await waitForDialogsClear(3000);
    var input = document.querySelector("input[data-testid='plu-number-input']")
             || document.querySelector("input[type='text']")
             || document.querySelector("input");
    if (!input) return false;
    input.focus();
    setInputValue(input, "");
    await sleep(80);
    setInputValue(input, String(code));
    await sleep(120);
    return true;
  }

  function clickPluButton() {
    // The green confirm tile whose visible text is exactly "PLU"
    var els = findByText(function (t) { return norm(t) === "plu"; });
    for (var i = 0; i < els.length; i++) {
      var target = els[i].closest("button, [role='button'], div") || els[i];
      target.click();
      return true;
    }
    return false;
  }

  function handleExitDialog() {
    var els = findText("no, continue", false);
    if (els.length) {
      (els[0].closest("button") || els[0]).click();
      log("  Dismissed exit dialog");
      return true;
    }
    return false;
  }

  function handleFeedbackDialog() {
    var mask = document.querySelector(".p-dialog-mask");
    if (!mask || !visible(mask)) return false;
    var btn = mask.querySelector("button");
    if (btn) { btn.click(); return true; }
    return false;
  }

  async function waitForDialogsClear(maxWait) {
    var waited = 0;
    maxWait = maxWait || 5000;
    while (waited < maxWait) {
      var mask = document.querySelector(".p-dialog-mask");
      if (!mask || !visible(mask)) return;
      if (!handleFeedbackDialog()) {
        await sleep(300);
        waited += 300;
      } else {
        await sleep(500);
        waited += 500;
      }
    }
  }

  /** Ask the Android UI for a code; resolves when the user submits. */
  function askUser(itemName) {
    return new Promise(function (resolve) {
      pendingCodeResolve = resolve;
      try {
        AndroidBridge.requestCode(itemName);
      } catch (e) {
        resolve("");
      }
    });
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  async function waitFor(fn, timeoutMs, stepMs) {
    var waited = 0;
    timeoutMs = timeoutMs || 30000;
    stepMs = stepMs || 500;
    while (waited < timeoutMs) {
      if (stopRequested) return false;
      try { if (fn()) return true; } catch (e) {}
      await sleep(stepMs);
      waited += stepMs;
    }
    return false;
  }

  function pluInputPresent() {
    return !!document.querySelector("input[data-testid='plu-number-input']");
  }

  async function clickAndSettle(text, exact) {
    var ok = clickText(text, exact);
    if (ok) await sleep(1400);
    return ok;
  }

  async function navigateToLearning() {
    log("\u25cf  Entering Learning\u2026");
    await clickAndSettle("Learning", true);
    await clickAndSettle("PLU learning mode", false);
    await clickAndSettle("ALL WITHOUT GOLDPLU", false);
    await clickAndSettle("ALL AVAILABLE", false);
  }

  async function navigateToTest() {
    log("\u25cf  Entering Test\u2026");
    await clickAndSettle("GO TO TEST", false);
    await clickAndSettle("START PLU TEST", false);
  }

  async function navigateToOneOfFour() {
    log("\u25cf  Entering One of Four\u2026");
    await clickAndSettle("One of Four", true);
    await clickAndSettle("BY NUMBER", false);
    await clickAndSettle("ALL WITHOUT GOLDPLU", false);
    await clickAndSettle("ALL AVAILABLE", false);
  }

  async function navigateToCheckLevel() {
    log("\u25cf  Entering PLU Check Level\u2026");
    await clickAndSettle("PLU Check Level", false);
    await clickAndSettle("ALL WITHOUT GOLDPLU", false);
    await clickAndSettle("ALL AVAILABLE", false);
  }

  function onDashboard() {
    return location.href.indexOf("/dashboard") !== -1;
  }

  async function returnToDashboard() {
    if (!clickText("Dashboard", true)) {
      location.href = DASHBOARD_URL;
    }
    await waitFor(onDashboard, 20000);
    await sleep(1500);
  }

  function hasPendingTest() {
    return findText("GO TO TEST", false).length > 0;
  }

  function resultsScreenShowing() {
    return findText("your result", false).length > 0 ||
           findText("overall stats", false).length > 0 ||
           findText("next round", false).length > 0;
  }

  // ------------------------------------------------------------------
  // Mode loops
  // ------------------------------------------------------------------
  async function runLearningMode() {
    var itemNum = 0, failures = 0, lastName = null;

    while (failures < 6 && !stopRequested) {
      handleExitDialog();
      await waitForDialogsClear();

      if (resultsScreenShowing()) {
        reportProgress(1, 1);
        log("\u2713  Learning complete \u2014 all codes saved.");
        return;
      }

      var name = getItemName();
      if (!name) {
        failures++;
        log("\u00b7  Waiting for item\u2026 (" + failures + "/6)");
        await sleep(1500);
        continue;
      }

      var prog = getProgress();
      if (prog) reportProgress(prog.current, prog.total);

      if (name === lastName) {
        await waitForDialogsClear(2000);
        name = getItemName() || name;
      }
      lastName = name;
      failures = 0;
      itemNum++;

      var revealed = getRevealedPlu();
      var counter = prog ? "[" + prog.current + "/" + prog.total + "]"
                         : "[" + itemNum + "]";
      if (revealed) {
        saveCode(name, revealed);
        log(counter + "  " + name + "  \u2192  " + revealed);
      } else {
        log("\u00b7  " + name + "  \u2192  (couldn't read code)");
      }

      // Learning mode wants the number entered three times
      var code = revealed || "0";
      for (var a = 0; a < 3; a++) {
        if (stopRequested) break;
        await enterPluCode(code);
        await sleep(200);
        clickPluButton();
        await sleep(450);
        await waitForDialogsClear();
        handleExitDialog();
        if (getItemName() !== name) break;
      }

      await sleep(PAUSE_BETWEEN_Q);
    }

    if (stopRequested) log("\u25a0  Stopped by user.");
    else log("\u25a0  Stopped (couldn't read the screen).");
  }

  /** Shared by Test Mode and Check Level - both use the numpad. */
  async function runNumpadMode(label) {
    var qNum = 0, failures = 0, lastName = null, sameCount = 0;

    while (failures < 3 && !stopRequested) {
      handleExitDialog();
      await waitForDialogsClear();

      var name = getItemName();
      if (!name) {
        if (resultsScreenShowing()) {
          reportProgress(1, 1);
          log("\u2713  " + label + " complete.");
          return;
        }
        failures++;
        await sleep(1200);
        continue;
      }

      var prog = getProgress();
      if (prog) reportProgress(prog.current, prog.total);

      if (name === lastName) {
        sameCount++;
        if (sameCount >= 2) {
          await waitForDialogsClear(3000);
          name = getItemName() || name;
        }
      } else {
        sameCount = 0;
      }
      lastName = name;
      failures = 0;
      qNum++;

      var counter = prog ? "[" + prog.current + "/" + prog.total + "]"
                         : "[" + qNum + "]";
      var code = findPlu(name);

      if (!code) {
        log("?  " + name + "  \u2192  code unknown, asking\u2026");
        var entered = (await askUser(name) || "").trim();
        if (entered) {
          saveCode(name, entered);
          code = entered;
        }
      }

      if (code) {
        await enterPluCode(code);
        await sleep(250);
        clickPluButton();
        log(counter + "  " + name + "  \u2192  " + code);
        await sleep(500);
        await waitForDialogsClear();
        handleExitDialog();
      } else {
        log("\u00b7  " + name + "  \u2192  skipped");
      }

      await sleep(PAUSE_BETWEEN_Q);
    }

    if (stopRequested) log("\u25a0  Stopped by user.");
    else log("\u25a0  Stopped (couldn't read the screen).");
  }

  async function runOneOfFour() {
    var qNum = 0, failures = 0, lastName = null;

    while (failures < 6 && !stopRequested) {
      handleExitDialog();
      await waitForDialogsClear();

      if (resultsScreenShowing()) {
        reportProgress(1, 1);
        log("\u2713  One of Four complete.");
        return;
      }

      var name = getItemName();
      if (!name) {
        failures++;
        log("\u00b7  Waiting for item\u2026 (" + failures + "/6)");
        await sleep(1500);
        continue;
      }

      var prog = getProgress();
      if (prog) reportProgress(prog.current, prog.total);
      if (name === lastName) {
        await waitForDialogsClear(2000);
        name = getItemName() || name;
      }
      lastName = name;
      failures = 0;
      qNum++;

      var counter = prog ? "[" + prog.current + "/" + prog.total + "]"
                         : "[" + qNum + "]";
      var code = findPlu(name);
      var options = getAnswerOptions();

      if (!code) {
        log("?  " + name + "  \u2192  code unknown, asking\u2026");
        var entered = (await askUser(name) || "").trim();
        if (entered) { saveCode(name, entered); code = entered; }
      }

      var clicked = false;
      if (code) {
        for (var i = 0; i < options.length; i++) {
          if (options[i].text === String(code)) {
            (options[i].el.closest("div, button") || options[i].el).click();
            log(counter + "  " + name + "  \u2192  " + code);
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) {
        if (options.length) {
          var texts = options.map(function (o) { return o.text; }).join(", ");
          (options[0].el.closest("div, button") || options[0].el).click();
          log(counter + "  " + name + "  \u2192  ? unsure (options: " + texts +
              ") picked " + options[0].text);
        } else {
          log("\u00b7  " + name + "  \u2192  no answer boxes found, skipped");
        }
      }

      await sleep(500);
      await waitForDialogsClear();
      handleExitDialog();
      await sleep(PAUSE_BETWEEN_Q);
    }

    if (stopRequested) log("\u25a0  Stopped by user.");
    else log("\u25a0  Stopped (couldn't read the screen).");
  }

  // ------------------------------------------------------------------
  // Entry point
  // ------------------------------------------------------------------
  async function start(mode) {
    if (running) { log("\u26a0  Already running."); return; }
    running = true;
    stopRequested = false;

    try {
      if (!onDashboard()) {
        log("\u25cf  Waiting for the dashboard (log in if prompted)\u2026");
        var ok = await waitFor(onDashboard, 180000, 1000);
        if (!ok) { log("\u26a0  Never reached the dashboard."); return; }
      }
      await sleep(1200);
      log("\u25cf  Dashboard ready");

      if (mode === "learn") {
        await navigateToLearning();
        if (!(await waitFor(pluInputPresent, 60000))) {
          log("\u26a0  Learning screen didn't load"); return;
        }
        log("\u25b6  Learning started\n");
        await runLearningMode();

      } else if (mode === "one_of_four") {
        await navigateToOneOfFour();
        if (!(await waitFor(function () { return !!getProgress(); }, 60000))) {
          log("\u26a0  Couldn't detect the quiz screen"); return;
        }
        log("\u25b6  One of Four started\n");
        await runOneOfFour();

      } else if (mode === "check_level") {
        await navigateToCheckLevel();
        if (!(await waitFor(pluInputPresent, 60000))) {
          log("\u26a0  Check Level screen didn't load"); return;
        }
        log("\u25b6  Check Level started\n");
        await runNumpadMode("Check Level");

      } else if (mode === "test") {
        // Keep running tests until none are left
        var round = 0;
        while (!stopRequested) {
          round++;
          if (round > MAX_TEST_ROUNDS) {
            log("\u25a0  Reached the " + MAX_TEST_ROUNDS + "-round limit.");
            break;
          }
          log(round > 1 ? "\n\u25b6  Test round " + round + " started\n"
                        : "\u25b6  Test started\n");

          await navigateToTest();
          if (!(await waitFor(pluInputPresent, 60000))) {
            log("\u26a0  Test screen didn't load"); break;
          }
          await runNumpadMode("Test");
          if (stopRequested) break;

          log("\u25cf  Checking for another test\u2026");
          await returnToDashboard();
          if (!hasPendingTest()) { log("\u2713  No more tests available."); break; }
          log("\u25cf  Another test is waiting \u2014 starting it\u2026");
          await sleep(1000);
        }

      } else {
        log("Unknown mode: " + mode);
      }
    } catch (e) {
      log("\u26a0  Error: " + (e && e.message ? e.message : e));
    } finally {
      running = false;
      try { AndroidBridge.finished(); } catch (e2) {}
    }
  }

  // ------------------------------------------------------------------
  // Public API (called from Android)
  // ------------------------------------------------------------------
  window.EasyPLUBot = {
    __ready: true,
    start: function (mode) { start(mode); },
    stop: function () { stopRequested = true; },
    isRunning: function () { return running; },
    setCodes: function (json) {
      try { pluCodes = JSON.parse(json) || {}; } catch (e) { pluCodes = {}; }
    },
    codeCount: function () { return Object.keys(pluCodes).length; },
    provideCode: function (code) {
      if (pendingCodeResolve) {
        var r = pendingCodeResolve;
        pendingCodeResolve = null;
        r(code || "");
      }
    }
  };
})();
