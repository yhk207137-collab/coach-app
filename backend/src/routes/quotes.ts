import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (_req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      include: { client: true, items: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(quotes);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) return res.status(404).json({ error: 'לא נמצא' });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { clientId, title, notes, validUntil, items } = req.body;
    const quote = await prisma.quote.create({
      data: {
        clientId,
        title,
        notes,
        validUntil: validUntil ? new Date(validUntil) : null,
        items: {
          create: (items || []).map((item: { description: string; duration?: string; price: number; quantity?: number }, i: number) => ({
            description: item.description,
            duration: item.duration,
            price: item.price,
            quantity: item.quantity ?? 1,
            order: i,
          })),
        },
      },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { title, notes, validUntil, status, items } = req.body;
    await prisma.quoteItem.deleteMany({ where: { quoteId: req.params.id } });
    const quote = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        title,
        notes,
        status,
        validUntil: validUntil ? new Date(validUntil) : null,
        items: {
          create: (items || []).map((item: { description: string; duration?: string; price: number; quantity?: number }, i: number) => ({
            description: item.description,
            duration: item.duration,
            price: item.price,
            quantity: item.quantity ?? 1,
            order: i,
          })),
        },
      },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Public: client views the quote ──────────────────────────────────────────
router.get('/review/:id', async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) return res.status(404).json({ error: 'לא נמצא' });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Public: client approves → auto-create contract ──────────────────────────
router.post('/review/:id/approve', async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) return res.status(404).json({ error: 'לא נמצא' });
    if (quote.status === 'ACCEPTED') {
      // Already accepted — find existing contract and return it
      const existing = await prisma.contract.findFirst({
        where: { clientId: quote.clientId, title: `חוזה התקשרות — ${quote.title}` },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return res.json({ contractId: existing.id });
    }

    const total = quote.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const endDate = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('he-IL') : '___________';
    const today = new Date().toLocaleDateString('he-IL');
    const itemsText = quote.items
      .map(i => `• ${i.description}${i.duration ? ` (${i.duration})` : ''} — ₪${(i.price * i.quantity).toLocaleString('he-IL')}`)
      .join('\n');

    const content = `חוזה התקשרות\n\nנערך ונחתם ב-${today}\n\nבין:\n${process.env.COACH_NAME || 'נותן השירות'} (להלן: "נותן השירות")\n\nלבין:\n${quote.client.fullName}${quote.client.businessName ? ` — ${quote.client.businessName}` : ''} (להלן: "מקבל השירות")\n\nנושא ההסכם: ${quote.title}\n\n───────────────────────────\n\nסעיף 1 — היקף השירותים\nנותן השירות מתחייב לספק את השירותים הבאים:\n\n${itemsText}\n\n───────────────────────────\n\nסעיף 2 — תמורה ותשלום\nהצדדים מסכימים כי התמורה הכוללת עבור השירותים תהיה:\nסכום כולל: ₪${total.toLocaleString('he-IL')}\n\nאופן התשלום יוסכם בין הצדדים בנפרד.\n\n───────────────────────────\n\nסעיף 3 — תקופת ההתקשרות\nתקופת ההסכם תחל ממועד החתימה ותסתיים בתאריך ${endDate}.\n\n───────────────────────────\n\nסעיף 4 — סודיות\nשני הצדדים מתחייבים לשמור על סודיות מלאה לגבי כל מידע שיועבר ביניהם במסגרת הסכם זה.\n\n───────────────────────────\n\nסעיף 5 — ביטול ההסכם\nביטול ההסכם על ידי מי מהצדדים יעשה בהודעה בכתב של 14 יום מראש.\n\n───────────────────────────\n\nהסכם זה נכנס לתוקף עם חתימת שני הצדדים.\n\nחתימת נותן השירות: _______________________\n\nחתימת מקבל השירות: _______________________`;

    const [updatedQuote, contract] = await prisma.$transaction([
      prisma.quote.update({ where: { id: req.params.id }, data: { status: 'ACCEPTED' }, include: { client: true, items: { orderBy: { order: 'asc' } } } }),
      prisma.contract.create({ data: { clientId: quote.clientId, title: `חוזה התקשרות — ${quote.title}`, content, status: 'SENT', validUntil: quote.validUntil }, include: { client: true } }),
    ]);

    res.json({ contractId: contract.id, quote: updatedQuote });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Public: client requests revision ────────────────────────────────────────
router.post('/review/:id/revision', async (req, res) => {
  try {
    const { message } = req.body;
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) return res.status(404).json({ error: 'לא נמצא' });
    const notePrefix = `[בקשת תיקון ${new Date().toLocaleDateString('he-IL')}]: ${message}`;
    await prisma.quote.update({
      where: { id: req.params.id },
      data: { notes: quote.notes ? `${notePrefix}\n\n${quote.notes}` : notePrefix },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Coach: manual accept ─────────────────────────────────────────────────────
router.post('/:id/accept', requireAuth, requireCoach, async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) return res.status(404).json({ error: 'לא נמצא' });

    const total = quote.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const endDate = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString('he-IL')
      : '___________';
    const today = new Date().toLocaleDateString('he-IL');

    const itemsText = quote.items
      .map(i => `• ${i.description}${i.duration ? ` (${i.duration})` : ''} — ₪${(i.price * i.quantity).toLocaleString('he-IL')}`)
      .join('\n');

    const content = `חוזה התקשרות

נערך ונחתם ב-${today}

בין:
ליוי שיווק ופרסום — סוכנות שיווק ופרסום לעמותות (להלן: "נותן השירות")

לבין:
${quote.client.fullName}${quote.client.businessName ? ` — ${quote.client.businessName}` : ''} (להלן: "מקבל השירות")

נושא ההסכם: ${quote.title}

───────────────────────────

סעיף 1 — היקף השירותים
נותן השירות מתחייב לספק את השירותים הבאים:

${itemsText}

───────────────────────────

סעיף 2 — תמורה ותשלום
הצדדים מסכימים כי התמורה הכוללת עבור השירותים תהיה:
סכום כולל: ₪${total.toLocaleString('he-IL')}

אופן התשלום יוסכם בין הצדדים בנפרד.

───────────────────────────

סעיף 3 — תקופת ההתקשרות
תקופת ההסכם תחל ממועד החתימה ותסתיים בתאריך ${endDate}.

───────────────────────────

סעיף 4 — סודיות
שני הצדדים מתחייבים לשמור על סודיות מלאה לגבי כל מידע שיועבר ביניהם במסגרת הסכם זה.

───────────────────────────

סעיף 5 — ביטול ההסכם
ביטול ההסכם על ידי מי מהצדדים יעשה בהודעה בכתב של 14 יום מראש.

───────────────────────────

הסכם זה נכנס לתוקף עם חתימת שני הצדדים.

חתימת נותן השירות: _______________________

חתימת מקבל השירות: _______________________`;

    const [updatedQuote, contract] = await prisma.$transaction([
      prisma.quote.update({
        where: { id: req.params.id },
        data: { status: 'ACCEPTED' },
        include: { client: true, items: { orderBy: { order: 'asc' } } },
      }),
      prisma.contract.create({
        data: {
          clientId: quote.clientId,
          title: `חוזה התקשרות — ${quote.title}`,
          content,
          status: 'DRAFT',
          validUntil: quote.validUntil,
        },
        include: { client: true },
      }),
    ]);

    res.json({ quote: updatedQuote, contract });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.quote.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
