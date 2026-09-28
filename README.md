# Food Planner 🥗

A meal planner and calorie tracker that runs in the browser and can be installed on your iPhone home screen.

## Features

- **Type what you ate, see the calories.** Write it the way you'd say it, e.g. `2 eggs, 1 slice toast with butter, coffee with milk`, and each item is broken down with grams, calories and protein/carbs/fat as you type.
  - Understands amounts like `150g`, `1 cup`, `2 tbsp`, `half an avocado`, `a banana`, `chicken 150g`, `two glasses of wine`.
  - Handles small typos (`brocoli`, `banan`).
  - Anything it doesn't know? Write the calories yourself: `pizza from work 285 kcal`. You can also save your own foods under **Me → My foods**.
- **Apple Watch calories.** Enter the active calories you burned (your Move ring), or sync them with an iPhone Shortcut (see below). They're added to your budget for the day, and you can choose to count only part of them (100/75/50/0%).
- **Recommendations.** The **Ideas** tab suggests meals that fit the calories you have left for your next meal. They're ranked by:
  - the foods, cuisines and styles you **like** (chicken, spicy, pasta, quick…)
  - never including what you **don't like**
  - your diet (vegetarian, pescatarian, vegan) and allergies (gluten, dairy, nuts, eggs, fish)
  - ❤️ favourites, and 👎 hides an idea for good
- **Weekly meal plan.** Plan breakfast, lunch, dinner and snacks for each day, or tap **✨ Fill empty slots** to fill the week from your preferences. You can then log a planned day to the tracker in one tap, and get a **🛒 shopping list** for the week.
- **Daily goal calculator** (Mifflin-St Jeor), macro bars, and daily tips.
- Works offline. All data stays on your device, and you can export or import a backup.

## Run it

It's plain HTML/CSS/JavaScript with no build step and no dependencies.

```bash
npm start          # serves on http://localhost:8080 (python3 http.server)
npm test           # runs the parser & recommendation tests (Node 18+)
```

### Put it on your phone

1. Host the folder anywhere static. The easiest option is **GitHub Pages**: repo **Settings → Pages → Deploy from a branch**, then pick the branch and `/ (root)`.
2. Open the URL in Safari on your iPhone → **Share → Add to Home Screen**.

## Syncing Apple Watch calories

A website can't read Apple Health directly, but an iPhone Shortcut can pass today's Active Energy to the app:

1. Open **Shortcuts** → **+** → name it “Sync calories”.
2. **Find Health Samples** where Type is *Active Energy* and Start Date *is today*.
3. **Calculate Statistics** → *Sum* of Health Samples.
4. **Round Number**.
5. **Copy to Clipboard** (Rounded Number).
6. **Text**: `https://YOUR-SITE/?burned=` followed by the *Rounded Number* variable.
7. **Open URLs** (Text).

You can also go to **Automation → Time of Day** (e.g. 9 pm daily) and set it to run “Sync calories”.

The app reads `?burned=452` (plus an optional `&date=YYYY-MM-DD`) and sets that day's burned calories. The exact link to use is shown under **Me → Apple Watch calories**.

> On iPhone, a Home Screen web app keeps its data separate from Safari. If you use the Home Screen version, run the shortcut, open the app and tap **📋** next to “Calories burned” to paste the number it copied.

## Project layout

```
index.html            app shell
css/styles.css        styles (light + dark mode)
js/app.js             UI: Today, Plan, Ideas, Me
js/parser.js          free text → food items with calories/macros
js/foods.js           built-in food database (~170 foods, per 100 g)
js/recipes.js         meal ideas used for recommendations and planning
js/recommend.js       ranking by budget, likes, diet and allergies
js/store.js           localStorage persistence and date helpers
sw.js                 offline cache
tests/                node:test unit tests
```

Calorie values are estimates. This is not medical advice.
