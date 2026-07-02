# מערכת ניהול אימון עסקי

## התקנה והפעלה

### דרישות מוקדמות
- Node.js 18+
- PostgreSQL 15+
- (אופציונלי) חשבון OpenAI, Gmail SMTP, Google Cloud

---

## שלב 1 – Backend

```bash
cd backend

# התקנת חבילות
npm install

# העתקת קובץ הגדרות
copy .env.example .env
# ערוך את .env עם הפרטים שלך

# אתחול מסד נתונים
npm run db:push

# יצירת משתמש מאמן ראשוני
npm run db:seed

# הרצה בפיתוח
npm run dev
```

### הגדרות `.env` חיוניות:
```
DATABASE_URL=postgresql://USER:PASS@localhost:5432/coach_app
JWT_SECRET=סיסמה-סודית-ארוכה
COACH_EMAIL=coach@example.com
COACH_PASSWORD=Coach1234!
COACH_NAME=שמך
```

---

## שלב 2 – Frontend

```bash
cd frontend

# התקנת חבילות
npm install

# הרצה בפיתוח
npm run dev
```

פתח: **http://localhost:5173**

---

## הגדרות אופציונליות

### מייל (Gmail)
1. כנס ל-Google Account → Security → App Passwords
2. צור App Password
3. הגדר ב-.env:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=app-password-here
```

### Google Calendar
1. Google Cloud Console → New Project
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials
4. הגדר Redirect URI: `http://localhost:4000/api/calendar/callback`
5. הגדר ב-.env:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```
6. לאחר הפעלה: `/api/calendar/connect`

### AI (תמלול + סיכום)
```
OPENAI_API_KEY=sk-...
```

---

## כניסה למערכת

- **מאמן**: `http://localhost:5173/login`
  - Email: הערך ב-COACH_EMAIL
  - Password: הערך ב-COACH_PASSWORD

- **לקוח**: `http://localhost:5173/login`
  - נוצר דרך API: `POST /api/auth/client/register`

---

## ארכיטקטורה

```
coach-app/
├── backend/          # Node.js + Express + Prisma
│   ├── src/
│   │   ├── routes/   # כל נקודות ה-API
│   │   ├── services/ # Email, Google Calendar
│   │   └── middleware/
│   └── prisma/       # סכמת מסד הנתונים
│
└── frontend/         # React + TypeScript + Tailwind
    └── src/
        ├── pages/    # כל המסכים
        ├── components/
        ├── services/
        └── store/
```

---

## מסכים

| מסך | נתיב |
|-----|-------|
| התחברות | `/login` |
| לוח בקרה | `/` |
| ניהול לקוחות | `/clients` |
| תיק לקוח | `/clients/:id` |
| פגישות | `/meetings` |
| משימות | `/tasks` |
| תשלומים | `/payments` |
| מסמכים | `/documents` |
| AI – תמלול | `/ai` |
| אזור לקוח | `/portal` |
