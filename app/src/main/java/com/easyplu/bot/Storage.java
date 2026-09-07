package com.easyplu.bot;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.Iterator;

/**
 * Stores learned PLU codes and user settings.
 *
 * Codes live in SharedPreferences as one JSON blob, seeded on first run
 * from assets/plu_codes.json.
 */
public class Storage {

    private static final String PREFS = "easyplu";
    private static final String KEY_CODES = "plu_codes";
    private static final String KEY_EMAIL = "email";
    private static final String KEY_PASSWORD = "password";
    private static final String KEY_LANGUAGE = "language";
    private static final String KEY_SEEDED = "seeded";

    private final SharedPreferences prefs;
    private final Context ctx;
    private JSONObject codes;

    public Storage(Context context) {
        this.ctx = context.getApplicationContext();
        this.prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        load();
    }

    private void load() {
        String raw = prefs.getString(KEY_CODES, null);
        if (raw == null) {
            raw = readAsset("plu_codes.json");
            prefs.edit().putString(KEY_CODES, raw).putBoolean(KEY_SEEDED, true).apply();
        }
        try {
            codes = new JSONObject(raw);
        } catch (Exception e) {
            codes = new JSONObject();
        }
    }

    private String readAsset(String name) {
        StringBuilder sb = new StringBuilder();
        try {
            InputStream is = ctx.getAssets().open(name);
            BufferedReader r = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
            r.close();
        } catch (Exception e) {
            return "{}";
        }
        return sb.toString();
    }

    /** Read the injected bot.js from assets. */
    public String readBotScript() {
        return readAsset("bot.js");
    }

    public String getCodesJson() {
        return codes.toString();
    }

    public int getCodeCount() {
        return codes.length();
    }

    public void putCode(String name, String code) {
        if (name == null || code == null) return;
        name = name.trim();
        code = code.trim();
        if (name.isEmpty() || code.isEmpty()) return;
        try {
            codes.put(name, code);
            prefs.edit().putString(KEY_CODES, codes.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Merge codes from a pasted/imported JSON object. Returns count added. */
    public int importCodes(String json) {
        int added = 0;
        try {
            JSONObject in = new JSONObject(json);
            Iterator<String> it = in.keys();
            while (it.hasNext()) {
                String k = it.next();
                String v = in.optString(k, "");
                if (!v.isEmpty()) {
                    codes.put(k, v);
                    added++;
                }
            }
            prefs.edit().putString(KEY_CODES, codes.toString()).apply();
        } catch (Exception ignored) {
        }
        return added;
    }

    public String getEmail() {
        return prefs.getString(KEY_EMAIL, "");
    }

    public String getPassword() {
        return prefs.getString(KEY_PASSWORD, "");
    }

    public String getLanguage() {
        return prefs.getString(KEY_LANGUAGE, "Englisch (UK)");
    }

    public void saveSettings(String email, String password, String language) {
        prefs.edit()
                .putString(KEY_EMAIL, email == null ? "" : email)
                .putString(KEY_PASSWORD, password == null ? "" : password)
                .putString(KEY_LANGUAGE, language == null ? "Englisch (UK)" : language)
                .apply();
    }
}
