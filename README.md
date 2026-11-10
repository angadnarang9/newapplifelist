# LifeList

**Make everyday life easier to manage.**

LifeList is a mobile-friendly web app that keeps your tasks, shopping lists, calendar, reminders and productivity tracking in one place. It's plain HTML, CSS and JavaScript with no build step and no dependencies to install.

## Run it

You need any static file server. Opening the page with `file://` mostly works, but a server is better for notifications and storage.

```bash
cd lifelist
python3 -m http.server 8000
```

Then open http://localhost:8000. Choose **Create account**, or **Try it without an account** to explore with example data.

## Deploy to Vercel

```bash
npx vercel deploy
```

No settings are needed because it's a static site. You can also drag the folder into Netlify, GitHub Pages or Cloudflare Pages.

## Cloud accounts with Supabase (optional)

By default, accounts and data are saved privately in the browser. Each account's data is stored separately, and passwords are stored as salted SHA-256 hashes. To get real accounts that sync across devices:

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`. It creates one row per user, protected by Row Level Security.
3. Put your project URL and **anon** key in `config.js`.

LifeList then uses Supabase Auth to sign in and syncs each user's data automatically. Guest mode still works locally.

## Features

| Area | What's included |
|---|---|
| **Home** | Date and greeting, today's completion ring, unfinished/overdue/events/shopping counts, today's tasks, priority tasks, upcoming events, approaching deadlines, reminders, shopping summary, Smart day plan |
| **My Tasks** | Add, edit, delete and complete tasks. Due date and time, priority (Low/Med/High or ✨ Auto from deadline), categories, notes, repeat (daily/weekdays/weekly/monthly), estimated time. Filter by priority, category and due date. Sort. To do and Completed are shown separately. Overdue tasks are highlighted. Smart reschedule. Undo |
| **Reminders** | Set a date and time, repeat daily/weekly/monthly, mark done. You can attach a reminder to any task or event. In-app alerts plus browser notifications |
| **Calendar** | Month, week and day views. Events with times, location and description. ⭐ important dates. Task deadlines appear on the calendar. Agenda for the selected day. "Coming up" list in date order. Export to `.ics` |
| **Shopping** | Multiple lists with optional budgets. Items get a category, quantity and price. Check items off. Shows items remaining, estimated total against budget, and has "clear purchased". New items are sorted into an aisle automatically |
| **Progress** | Completed this week compared with last week, weekly completion %, streak, daily activity chart, completed vs unfinished, most productive weekdays, 8-week trend, category breakdown, and a written weekly summary |
| **Quick Add** | The **+** button, or press `N` anywhere. Type naturally, e.g. "Dentist Fri 3pm", "Buy 2 milk", "Remind me to call mom tomorrow 6pm", "Taxes Nov 20 !high". LifeList works out whether it's a task, event, reminder or shopping item, plus the date, time, priority and category |
| **Search** | Press `/` to search across tasks, events, reminders and shopping items |
| **Settings** | Profile, light/dark/system theme, currency, notifications, planning hours, week start, custom categories, dashboard layout (show, hide, reorder), export to CSV/ICS/JSON, restore a backup, sign out, delete account |

The "smart" features (auto-priority, day planning, rescheduling, weekly summary, auto-categorising) are rules that run in the browser. They don't use any external AI service. To try a real LLM later, `planDay()` and `weeklyInsights()` in `js/app.js` are the places to plug it in.

## Project structure

```
lifelist/
├── index.html          # App entry point
├── config.js           # Optional Supabase keys
├── css/styles.css      # Design system, light and dark themes, responsive layout
├── js/app.js           # All app logic (state, views, storage, auth)
└── supabase/schema.sql # Database table and row-level security policies
```

Layout: there's a sidebar on desktop, and a bottom navigation bar with a floating + button on phones and tablets under 900px wide.
