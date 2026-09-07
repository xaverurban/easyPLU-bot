package com.easyplu.bot;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.text.method.ScrollingMovementMethod;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;

public class MainActivity extends Activity {

    private static final String DASHBOARD = "https://easy-plu.knowledge-hero.com/dashboard";

    // Palette (matches the desktop app)
    private static final int BG = Color.parseColor("#0e1116");
    private static final int CARD = Color.parseColor("#161b22");
    private static final int TEXT = Color.parseColor("#e6edf3");
    private static final int TEXT_DIM = Color.parseColor("#8b949e");
    private static final int ACCENT = Color.parseColor("#3b82f6");
    private static final int PURPLE = Color.parseColor("#a855f7");
    private static final int ORANGE = Color.parseColor("#f59e0b");
    private static final int GREEN = Color.parseColor("#22c55e");
    private static final int RED = Color.parseColor("#ef4444");

    private WebView web;
    private TextView statusLabel, progressLabel, codesLabel, logView;
    private ProgressBar progressBar;
    private Button learnBtn, ofoBtn, levelBtn, testBtn, stopBtn;
    private ScrollView logScroll;
    private Storage storage;

    private boolean botReady = false;
    private boolean running = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        storage = new Storage(this);
        setContentView(buildUi());
        setupWebView();
        appendLog("\u25cf  " + storage.getCodeCount() + " PLU codes ready");
        appendLog("\u25cf  Loading easyPLU\u2026");
    }

    // ------------------------------------------------------------------
    // UI (built in code to keep the build dependency-free)
    // ------------------------------------------------------------------
    private View buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        int pad = dp(12);
        root.setPadding(pad, dp(20), pad, pad);

        // --- Header ---
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText("easyPLU");
        title.setTextColor(TEXT);
        title.setTextSize(22);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        header.addView(title);

        TextView accent = new TextView(this);
        accent.setText("bot");
        accent.setTextColor(ACCENT);
        accent.setTextSize(22);
        accent.setTypeface(null, android.graphics.Typeface.BOLD);
        header.addView(accent);

        View spacer = new View(this);
        header.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));

        Button account = smallButton("\u2699 Account", CARD);
        account.setOnClickListener(v -> showSettings());
        header.addView(account);

        root.addView(header);

        // --- Mode buttons (2 x 2 grid) ---
        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        row1.setPadding(0, dp(12), 0, 0);
        learnBtn = modeButton("\uD83D\uDCD8 Learning", ACCENT, "learn");
        ofoBtn = modeButton("\uD83D\uDD22 One of Four", PURPLE, "one_of_four");
        row1.addView(learnBtn, equalWidth());
        row1.addView(gap());
        row1.addView(ofoBtn, equalWidth());
        root.addView(row1);

        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setPadding(0, dp(8), 0, 0);
        levelBtn = modeButton("\uD83D\uDCCA Check Level", ORANGE, "check_level");
        testBtn = modeButton("\uD83C\uDFAF Test Mode", GREEN, "test");
        row2.addView(levelBtn, equalWidth());
        row2.addView(gap());
        row2.addView(testBtn, equalWidth());
        root.addView(row2);

        // --- Status + progress ---
        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);
        statusRow.setPadding(dp(4), dp(14), dp(4), dp(4));

        statusLabel = new TextView(this);
        statusLabel.setText("Idle");
        statusLabel.setTextColor(TEXT);
        statusLabel.setTextSize(14);
        statusLabel.setTypeface(null, android.graphics.Typeface.BOLD);
        statusRow.addView(statusLabel);

        View s2 = new View(this);
        statusRow.addView(s2, new LinearLayout.LayoutParams(0, 1, 1f));

        progressLabel = new TextView(this);
        progressLabel.setTextColor(TEXT_DIM);
        progressLabel.setTextSize(13);
        progressLabel.setPadding(0, 0, dp(10), 0);
        statusRow.addView(progressLabel);

        stopBtn = smallButton("Stop", RED);
        stopBtn.setEnabled(false);
        stopBtn.setOnClickListener(v -> stopBot());
        statusRow.addView(stopBtn);

        root.addView(statusRow);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        root.addView(progressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(8)));

        // --- Activity log ---
        TextView logTitle = new TextView(this);
        logTitle.setText("Activity");
        logTitle.setTextColor(TEXT_DIM);
        logTitle.setTextSize(12);
        logTitle.setPadding(dp(4), dp(12), 0, dp(4));
        root.addView(logTitle);

        logScroll = new ScrollView(this);
        logScroll.setBackgroundColor(CARD);
        logView = new TextView(this);
        logView.setTextColor(TEXT);
        logView.setTextSize(11);
        logView.setTypeface(android.graphics.Typeface.MONOSPACE);
        logView.setPadding(dp(10), dp(10), dp(10), dp(10));
        logView.setMovementMethod(new ScrollingMovementMethod());
        logScroll.addView(logView);
        root.addView(logScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(150)));

        codesLabel = new TextView(this);
        codesLabel.setTextColor(TEXT_DIM);
        codesLabel.setTextSize(11);
        codesLabel.setPadding(dp(4), dp(6), 0, dp(6));
        codesLabel.setText(storage.getCodeCount() + " codes saved");
        root.addView(codesLabel);

        // --- WebView fills the rest ---
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        return root;
    }

    private LinearLayout.LayoutParams equalWidth() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    }

    private View gap() {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(8), 1));
        return v;
    }

    private Button modeButton(String label, int color, final String mode) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(13);
        b.setBackgroundColor(color);
        b.setOnClickListener(v -> startBot(mode, label, color));
        return b;
    }

    private Button smallButton(String label, int color) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(TEXT);
        b.setTextSize(12);
        b.setBackgroundColor(color);
        return b;
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    // ------------------------------------------------------------------
    // WebView
    // ------------------------------------------------------------------
    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        // A desktop UA keeps the site's desktop layout, which the bot targets
        s.setUserAgentString(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                        + "Chrome/124.0.0.0 Safari/537.36");

        web.addJavascriptInterface(new BotBridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                injectBot();
            }
        });

        web.loadUrl(DASHBOARD);
    }

    /** Inject bot.js and hand it the current code database. */
    private void injectBot() {
        String js = storage.readBotScript();
        web.evaluateJavascript(js, value -> {
            botReady = true;
            String codes = JSONObject.quote(storage.getCodesJson());
            web.evaluateJavascript("EasyPLUBot.setCodes(" + codes + ");", null);
        });
    }

    // ------------------------------------------------------------------
    // Bot control
    // ------------------------------------------------------------------
    private void startBot(String mode, String label, int color) {
        if (running) return;
        if (!botReady) {
            appendLog("\u26a0  Page still loading, try again in a moment.");
            return;
        }
        running = true;
        setButtonsEnabled(false);
        stopBtn.setEnabled(true);
        statusLabel.setText("Running \u00b7 " + label);
        statusLabel.setTextColor(color);
        progressBar.setProgress(0);
        progressLabel.setText("");
        logView.setText("");

        String codes = JSONObject.quote(storage.getCodesJson());
        web.evaluateJavascript("EasyPLUBot.setCodes(" + codes + ");", null);
        web.evaluateJavascript("EasyPLUBot.start('" + mode + "');", null);
    }

    private void stopBot() {
        appendLog("\u25a0  Stopping after this step\u2026");
        stopBtn.setEnabled(false);
        web.evaluateJavascript("EasyPLUBot.stop();", null);
    }

    private void onBotFinished() {
        running = false;
        setButtonsEnabled(true);
        stopBtn.setEnabled(false);
        statusLabel.setText("Idle");
        statusLabel.setTextColor(TEXT);
        codesLabel.setText(storage.getCodeCount() + " codes saved");
    }

    private void setButtonsEnabled(boolean on) {
        learnBtn.setEnabled(on);
        ofoBtn.setEnabled(on);
        levelBtn.setEnabled(on);
        testBtn.setEnabled(on);
    }

    private void appendLog(String text) {
        logView.append(text + "\n");
        logScroll.post(() -> logScroll.fullScroll(View.FOCUS_DOWN));
    }

    // ------------------------------------------------------------------
    // Dialogs
    // ------------------------------------------------------------------
    /** Prompt the user for an unknown PLU code. */
    private void promptForCode(final String itemName) {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setHint("PLU code");

        new AlertDialog.Builder(this)
                .setTitle("Unknown PLU")
                .setMessage(itemName)
                .setView(input)
                .setCancelable(false)
                .setPositiveButton("Submit", (d, w) -> {
                    String code = input.getText().toString().trim();
                    if (!code.isEmpty()) storage.putCode(itemName, code);
                    codesLabel.setText(storage.getCodeCount() + " codes saved");
                    web.evaluateJavascript(
                            "EasyPLUBot.provideCode('" + code.replace("'", "") + "');", null);
                })
                .setNegativeButton("Skip", (d, w) ->
                        web.evaluateJavascript("EasyPLUBot.provideCode('');", null))
                .show();
    }

    private void showSettings() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        box.setPadding(p, p, p, p);

        final EditText email = new EditText(this);
        email.setHint("Email");
        email.setText(storage.getEmail());
        email.setInputType(InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        box.addView(email);

        final EditText pw = new EditText(this);
        pw.setHint("Password");
        pw.setText(storage.getPassword());
        pw.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        box.addView(pw);

        TextView langLabel = new TextView(this);
        langLabel.setText("Language");
        langLabel.setPadding(0, dp(12), 0, 0);
        box.addView(langLabel);

        final String[] langs = {"Englisch (UK)", "Englisch (IE)", "Englisch (US)",
                "Englisch (MT)", "Deutsch (DE)", "Ungarisch"};
        final Spinner spinner = new Spinner(this);
        spinner.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, langs));
        for (int i = 0; i < langs.length; i++) {
            if (langs[i].equals(storage.getLanguage())) spinner.setSelection(i);
        }
        box.addView(spinner);

        TextView note = new TextView(this);
        note.setText("Codes are saved on this device. Use 'Import codes' to paste "
                + "a plu_codes_custom.json from the desktop app.");
        note.setTextSize(11);
        note.setPadding(0, dp(12), 0, 0);
        box.addView(note);

        new AlertDialog.Builder(this)
                .setTitle("Account")
                .setView(box)
                .setPositiveButton("Save", (d, w) -> {
                    storage.saveSettings(email.getText().toString(),
                            pw.getText().toString(),
                            langs[spinner.getSelectedItemPosition()]);
                    appendLog("\u25cf  Settings saved");
                })
                .setNeutralButton("Import codes", (d, w) -> showImport())
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showImport() {
        final EditText input = new EditText(this);
        input.setHint("Paste JSON here");
        input.setMinLines(6);
        input.setGravity(Gravity.TOP);

        new AlertDialog.Builder(this)
                .setTitle("Import PLU codes")
                .setView(input)
                .setPositiveButton("Import", (d, w) -> {
                    int n = storage.importCodes(input.getText().toString());
                    appendLog("\u25cf  Imported " + n + " code(s)");
                    codesLabel.setText(storage.getCodeCount() + " codes saved");
                    String codes = JSONObject.quote(storage.getCodesJson());
                    web.evaluateJavascript("EasyPLUBot.setCodes(" + codes + ");", null);
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ------------------------------------------------------------------
    // JavaScript bridge
    // ------------------------------------------------------------------
    private class BotBridge {

        @JavascriptInterface
        public void log(final String text) {
            runOnUiThread(() -> appendLog(text));
        }

        @JavascriptInterface
        public void progress(final int current, final int total) {
            runOnUiThread(() -> {
                if (total > 0) {
                    progressBar.setProgress(Math.min(100, current * 100 / total));
                    progressLabel.setText(current + " / " + total);
                }
            });
        }

        @JavascriptInterface
        public void saveCode(final String name, final String code) {
            storage.putCode(name, code);
            runOnUiThread(() ->
                    codesLabel.setText(storage.getCodeCount() + " codes saved"));
        }

        @JavascriptInterface
        public void requestCode(final String name) {
            runOnUiThread(() -> promptForCode(name));
        }

        @JavascriptInterface
        public void finished() {
            runOnUiThread(MainActivity.this::onBotFinished);
        }
    }
}
