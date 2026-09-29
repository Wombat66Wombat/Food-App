# My Space ✨

Your organized space in one app: a calorie **deficit** tracker, meal planner, **timetable**, **Mandarin flashcards** and a **focus timer**, all in one theme. It runs in the browser and can be installed on your iPhone home screen.

**Live app:** https://wombat66wombat.github.io/Food-App/ (after GitHub Pages is turned on, see below)

## Sections

### 🍽️ Food: calorie deficit
- Set your **maintenance calories** (what you burn on a normal day *without* workouts) and a **deficit %** (10–25%). The app works out your daily **eating target**, e.g. 2000 kcal − 20% = 1600 kcal.
- Apple Watch calories **do not** raise what you can eat. They make your deficit bigger instead.
- The day's result is `maintenance + burned − eaten`. You meet your goal when that is at least your deficit goal. A 7-day strip shows ✓ or ✗ for each day, plus your weekly deficit in kg.
- Type what you ate the way you'd say it, e.g. `2 eggs, 1 slice toast with butter, coffee with milk`, and you'll see calories and macros as you type.
- To sync burned calories, see "Apple Watch sync" below.

### 🥗 Meals
- **Week plan:** plan each meal slot, or tap **✨ Fill empty slots** to fill them from your preferences. You can log a planned day in one tap and get a 🛒 shopping list.
- **Ideas:** suggestions that fit what you can still eat today, ranked by your likes, dislikes, diet, allergies and ❤️ favourites.

### 🗓️ Timetable
- A weekly schedule that repeats every week: classes, work, gym… Add an entry to several days at once and give it a color.
- **Week A / Week B:** tap "School has Week A / Week B?", say whether this week is A or B, and the app alternates every Monday. Each lesson can be every week, only A or only B. After holidays, tap the **Week A/B** badge to correct it.
- The Day view shows **Now** and **Next**, with how long until the next thing starts. The Week view shows the whole week.

### 🀄 中文 Mandarin flashcards
- Write your own cards every day: 汉字, pinyin (type `ni3 hao3` and it becomes `nǐ hǎo`), meaning, and an optional example. The daily goal is 5 new cards by default, and a 🔥 streak counts the days in a row you hit it.
- **Practice** uses spaced repetition: cards you know come back after 1, 2, 4, 7, 14… days, and cards you miss come back today. You can practise 汉字 → meaning or meaning → 汉字.
- **Writing pad** with a 田字格 grid: write the character, tap **Trace** to show it faintly underneath, and 🔊 plays the pronunciation.

### ⏱️ Fokus: "Nicht lernen. Nur anfangen."
- Focus timer: Nur 5 Min / Fokus 25 / Pause 5. It beeps and vibrates when it's done, and keeps running while you're in other sections.
- **Aufgabe zerlegen:** break a task into tiny steps and tick them off.
- **Startklar in 2 Minuten:** a short checklist.
- **Heute geschafft:** focus sessions, minutes and steps done today.

### ⚙️ Settings: one theme everywhere
- **📱 Match phone** follows your iPhone's light or dark mode automatically. You can also force ☀️ Light or 🌙 Dark.
- **Color themes:** Matcha, Ocean, Lavender, Sunset, Rose, Lagoon, Graphite.
- **Match your wallpaper:** pick your wallpaper photo (or a home screen screenshot) and the whole app takes its accent color from it. You can also show the wallpaper behind the app.
- Also here: food preferences, My foods, Apple Watch sync, the Mandarin daily goal, and backup export/import.

## Launch it

### Put it online (free, once)
1. Open **https://github.com/Wombat66Wombat/Food-App/settings/pages**
2. **Source:** Deploy from a branch → Branch `claude/meal-plan-calorie-tracker-lbrplh`, folder `/ (root)` → **Save**.
3. After 1–2 minutes it's live at **https://wombat66wombat.github.io/Food-App/**

### Put it on your iPhone
Open the link in **Safari** → **Share** → **Add to Home Screen**.

### Run locally
```bash
npm start   # http://localhost:8080
npm test    # unit tests (Node 18+)
```

## Apple Watch sync
A website can't read Apple Health directly, but an iPhone Shortcut can:

1. **Shortcuts** → **+** → name it “Sync calories”.
2. **Find Health Samples** where Type is *Active Energy* and Start Date *is today*.
3. **Calculate Statistics** → *Sum*.
4. **Round Number**, then **Copy to Clipboard**.
5. **Text**: `https://wombat66wombat.github.io/Food-App/?burned=` followed by the *Rounded Number* variable.
6. **Open URLs**.

Optional: Automation → *Time of Day* (e.g. 9 pm) → run it.

> A Home Screen web app keeps its data separate from Safari. If you use the Home Screen version, run the shortcut, open the app and tap **📋** next to “Calories burned”.

## Project layout
```
index.html          app shell + tab bar
css/styles.css      one theme (tokens, light/dark, accent-tinted)
js/app.js           navigation, events, Apple Watch URL sync
js/core.js          shared state, sheet, toast
js/theme.js         palettes, light/dark, wallpaper color extraction
js/food.js          Food & Meals views, deficit logic
js/parser.js        free text → foods with calories/macros
js/foods.js         food database (~170 foods)
js/recipes.js       meal ideas
js/recommend.js     ranking by budget & preferences
js/timetable.js     weekly timetable
js/mandarin.js      flashcards, pinyin tones, spaced repetition, writing pad
js/focus.js         Fokus timer, steps, checklist
js/settings.js      settings
js/store.js         localStorage + date helpers
sw.js               offline cache
tests/              node:test unit tests
```

All data stays on your device. Calorie values are estimates. This is not medical advice.
