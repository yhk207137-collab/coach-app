# העוזר האישי בוואטסאפ

מודול עצמאי. הוא רץ על אותו שרת כמו המערכת, כדי לא לשלם על שרת נוסף.
הוא **לא מחובר למערכת**: יש לו טבלאות משלו, חיבור גוגל משלו ונתיבים משלו, והוא לא קורא שום נתון של המערכת.

## איך הוא עובד

- **וואטסאפ:** שולחים הודעה למספר של העוזר. Meta מעבירה אותה ל-`/api/assistant/whatsapp`.
- **אבטחה:**
  - רק הודעות חתומות של Meta מתקבלות.
  - רק המספר של הבעלים מקבל תשובה.
  - כל הודעה מטופלת פעם אחת.
- **המוח** רץ על **מנוי Claude** של הבעלים, דרך Claude Agent SDK והטוקן `CLAUDE_CODE_OAUTH_TOKEN` מ-`claude setup-token`. אין עלות API.
  - Opus הוא ה"מנכ"ל", עם מאמץ נמוך כברירת מחדל.
  - שני עוזרים זולים: `reader` (Haiku) לקריאה של הרבה חומר, ו-`researcher` (Sonnet) לחיפוש ברשת.
  - כלים מובנים של קבצים ושורת פקודה **כבויים**. יש לו רק את הכלים שלו, חיפוש ברשת והעוזרים.
- **אישור לפני פעולה בשמך:** כל דבר שיוצא לאדם אחר נשמר כ"ממתין". זה כולל מייל, הזמנה עם אורחים, והזזה או ביטול של פגישה עם אורחים. הוא מתבצע רק אחרי "כן" של הבעלים בהודעה **חדשה**. זה נאכף בקוד (`approve_pending`).
- **זיכרון:** עובדות קבועות נשמרות ב-`AssistantMemory`. מנהלים אותו מתוך הוואטסאפ: "מה אתה זוכר עליי?", "תשכח ש...".
- **גוגל:** "תן לי קישור לחבר את גוגל". העוזר שולח קישור חד-פעמי ל-15 דקות, לחיבור יומן וג'ימייל.

## משתני סביבה

| משתנה | מה |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | הטוקן מ-`claude setup-token` (מנוי Pro/Max) |
| `ASSISTANT_PUBLIC_URL` | הכתובת הציבורית של השרת, בשביל קישור גוגל |
| `ASSISTANT_MODEL`, `ASSISTANT_EFFORT` | ברירת מחדל `opus` / `low` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | מ-Meta |
| `WHATSAPP_OWNER_NUMBER` | המספר האישי של הבעלים, שרק ממנו מקבלים פקודות |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | אותו לקוח OAuth. צריך להוסיף את `<ASSISTANT_PUBLIC_URL>/api/assistant/google/callback` ל-Authorized redirect URIs |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | אפליקציית Server-to-Server OAuth בזום |
| `OPENAI_API_KEY` | אופציונלי, לתמלול הודעות קוליות |

## הטמעה מלאה בתוכנה לניהול העסק (בעתיד)

ההטמעה היא בקוד עצמו, בלי API חיצוני ובלי MCP. התוכנה מעבירה לעוזר רשימת פעולות (`HostTool`), שהן פונקציות רגילות שלה, והעוזר מפעיל אותן ישירות מתוכה.

```ts
import { z } from 'zod';
import { mountAssistant } from './assistant';

mountAssistant(app, {
  hostDescription: 'מערכת ניהול הלקוחות של העסק: לקוחות, פגישות, משימות ותשלומים',
  hostTools: [
    {
      name: 'find_client',
      description: 'מציאת לקוח לפי שם, טלפון או מייל',
      input: { query: z.string() },
      kind: 'read',
      run: ({ query }) => clients.search(query),
    },
    {
      name: 'add_task',
      description: 'הוספת משימה ללקוח',
      input: { clientId: z.string(), title: z.string(), due: z.string().optional() },
      kind: 'act',
      run: (i) => tasks.create(i),
    },
    {
      name: 'send_invoice',
      description: 'שליחת חשבונית ללקוח',
      input: { clientId: z.string(), amount: z.number() },
      kind: 'needs_approval', // יוצא ללקוח ונוגע בכסף: רק אחרי "כן" בוואטסאפ
      summary: (i) => `שליחת חשבונית על ${i.amount} ₪`,
      run: (i) => invoices.send(i),
    },
  ],
});
```

- `read`: רק קורא. גם העוזרים הזולים יכולים להשתמש בזה.
- `act`: משנה משהו בתוך התוכנה, ומתבצע מיד.
- `needs_approval`: יוצא לאנשים או נוגע בכסף, ומחכה ל"כן" של הבעלים.

זה הכול. אין שינוי בעוזר עצמו. אם התוכנה כתובה בשפה אחרת או רצה בשרת אחר, מעבירים את התיקייה הזו לשם ובונים את `hostTools` מהפונקציות שלה.

## בדיקה מקומית

`ASSISTANT_LOCAL_LOGIN=1` משתמש בכניסה של Claude Code שכבר קיימת על המחשב, במקום בטוקן.
