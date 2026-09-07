# easyPLU Bot — Android

An Android app that automates easyPLU **Learning**, **One of Four**,
**Check Level** and **Test** modes, on your phone.

The site runs in a WebView inside the app, and the automation engine
(`bot.js`) drives the page directly through the DOM — the same logic as
the desktop Python bot, rewritten in JavaScript.

---

## Getting the APK (no Android Studio needed)

The repo ships with a GitHub Actions workflow that compiles the APK on
GitHub's servers for free. You just push the code and download the result.

1. Create a **new repository** on GitHub (private is fine).
2. Upload this whole folder to it. Easiest way in the browser:
   *Add file → Upload files*, drag everything in, **Commit**.
   Make sure the hidden `.github` folder goes up too — if the browser
   skips it, use Git instead:
   ```
   git init
   git add .
   git commit -m "easyPLU bot"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Open the **Actions** tab. The *Build APK* job starts automatically
   (or press *Run workflow*). It takes roughly 3–5 minutes.
4. When it turns green, open the run and download the
   **easyPLU-Bot-APK** artifact at the bottom. Unzip it to get
   `easyPLU-Bot.apk`.
5. Copy the APK to your phone and open it. Android will ask you to allow
   installing from unknown sources — that's expected for an app that
   didn't come from the Play Store.

The APK is signed with the standard debug key so it installs without
extra setup. That's fine for personal use; it just can't be published to
the Play Store as-is.

### Building locally instead

With Android Studio: *File → Open* this folder, then
*Build → Build Bundle(s)/APK(s) → Build APK(s)*.

From a terminal with the Android SDK installed:
```
gradle assembleRelease
```
The APK lands in `app/build/outputs/apk/release/`.

---

## Using the app

1. Open the app. The easyPLU site loads in the panel at the bottom.
2. Log in (once — the session is remembered).
3. Tap a mode:

| Mode | What it does |
|---|---|
| **Learning** | Learning → PLU learning mode → ALL WITHOUT GOLDPLU → ALL AVAILABLE, then reads each revealed PLU and saves it |
| **One of Four** | One of Four → BY NUMBER → ALL WITHOUT GOLDPLU → ALL AVAILABLE, then taps the correct answer box |
| **Check Level** | PLU Check Level → ALL WITHOUT GOLDPLU → ALL AVAILABLE, then types each PLU on the numpad |
| **Test Mode** | GO TO TEST → START PLU TEST, answers everything, then returns to the dashboard and starts the next test automatically until none are left |

4. Watch the **Activity** log and progress bar. **Stop** halts it after
   the current step.
5. If the bot meets an item it doesn't know, a dialog asks you for the
   PLU code, then remembers it.

---

## Your PLU codes

92 codes are built in. Everything learned or typed in is saved on the
device.

To bring across the codes from the desktop app: open
`plu_codes_custom.json`, copy the whole file, then in the app tap
**⚙ Account → Import codes** and paste it in.

---

## Notes

- The WebView uses a desktop user-agent so the site keeps its desktop
  layout, which is what the automation targets. Turn the phone
  **landscape**, or pinch to zoom, if the page feels cramped.
- Login and language are entered in the WebView itself rather than
  automated — on mobile it's quicker to just tap them once, and the
  session persists.
- If the site's layout changes, `app/src/main/assets/bot.js` is where the
  selectors live. It's plain JavaScript and needs no rebuild knowledge to
  edit — just change it and re-run the workflow.

---

## Layout

```
├── .github/workflows/build-apk.yml   ← builds the APK on GitHub
├── build.gradle, settings.gradle     ← Gradle config
└── app/
    ├── build.gradle
    └── src/main/
        ├── AndroidManifest.xml
        ├── assets/
        │   ├── bot.js                ← the automation engine
        │   └── plu_codes.json        ← built-in PLU database
        ├── java/com/easyplu/bot/
        │   ├── MainActivity.java     ← UI + JS bridge
        │   └── Storage.java          ← saved codes & settings
        └── res/…
```
