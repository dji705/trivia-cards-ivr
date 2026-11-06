const QUESTIONS = [
  { q: "כמה ימים יש בשבוע?", a: ["5", "6", "7", "8"], correct: 3, explain: "בשבוע יש שבעה ימים." },
  { q: "מהי בירת צרפת?", a: ["רומא", "פריז", "מדריד", "לונדון"], correct: 2, explain: "בירת צרפת היא פריז." },
  { q: "כמה צלעות יש למשולש?", a: ["2", "3", "4", "5"], correct: 2, explain: "למשולש שלוש צלעות." },
  { q: "איזה כוכב לכת מכונה הכוכב האדום?", a: ["מאדים", "נוגה", "שבתאי", "צדק"], correct: 1, explain: "מאדים מכונה הכוכב האדום." },
  { q: "כמה זה 9 כפול 8?", a: ["64", "72", "81", " ಯಾವುದ"], correct: 2, explain: "תשע כפול שמונה הם שבעים ושתיים." },
  { q: "איזו חיה מכונה מלך החיות?", a: ["פיל", "נמר", "אריה", "זאב"], correct: 3, explain: "האריה מכונה מלך החיות." },
  { q: "באיזה כלי מודדים טמפרטורה?", a: ["סרגל", "מדחום", "שעון", "משקל"], correct: 2, explain: "טמפרטורה מודדים במדחום." },
  { q: "כמה דקות יש בשעה?", a: ["30", "50", "60", "100"], correct: 3, explain: "בשעה יש שישים דקות." }
];
const SUITS = ["לב", "יהלום", "עלה", "תלתן"];
const RANKS = ["שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע", "עשר", "נסיך", "מלכה", "מלך", "אס"];

function getUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  return new URL(req.url, proto + "://" + (req.headers.host || "localhost"));
}
function send(res, message, opts = {}) {
  const { name = "wm_nav", min = 1, max = 1, timeout = 5 } = opts;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`read=${String(message).replace(/=/g, " ").replace(/[\r\n]/g, " ")}=${name},no,${max},${min},${timeout},Digits,no,no,,,1,Ok`);
}
function getDigits(url, names) {
  for (const n of names) {
    const v = url.searchParams.get(n);
    if (v !== null && v !== "") return String(v).replace(/\D/g, "");
  }
  return "";
}
function phoneKey(url) {
  const phone = getDigits(url, ["ApiPhone", "Phone", "caller_id", "ApiCallerId"]);
  return phone || "anonymous";
}
async function redis(command, ...args) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) throw new Error("REDIS_NOT_CONFIGURED");
  const response = await fetch(base.replace(/\/$/, "") + "/" + [command, ...args].map(v => encodeURIComponent(v)).join("/"), {
    headers: { Authorization: "Bearer " + token }
  });
  if (!response.ok) throw new Error("REDIS_ERROR");
  const data = await response.json();
  return data.result;
}
async function load(key) {
  const raw = await redis("GET", key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function save(key, state) {
  await redis("SET", key, JSON.stringify(state), "EX", "43200");
}
function menu() {
  return "ברוכים הבאים למשחקי טריוויה וקלפים. למשחק טריוויה הקישו 1. למשחק מלחמה נגד בוט הקישו 2. להצגת ההוראות הקישו 3.";
}
function shuffledDeck() {
  const deck = [];
  for (let s = 0; s < SUITS.length; s++) for (let r = 2; r <= 14; r++) deck.push({ rank: r, suit: SUITS[s] });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function cardName(card) { return RANKS[card.rank - 2] + " " + card.suit; }
async function startQuiz(res, key) {
  const state = { mode: "quiz", index: 0, score: 0, asked: [] };
  await save(key, state);
  return quizQuestion(res, key, state);
}
async function quizQuestion(res, key, state, prefix = "") {
  if (state.index >= 5) {
    const score = state.score;
    await redis("DEL", key);
    return send(res, `${prefix} סיימתם חמישה סיבובים. צברתם ${score} נקודות מתוך חמש. לתפריט הראשי הקישו כוכבית.`, { name: "wm_nav", min: 1, max: 1 });
  }
  let idx;
  do { idx = Math.floor(Math.random() * QUESTIONS.length); } while (state.asked.includes(idx));
  state.current = idx;
  state.asked.push(idx);
  await save(key, state);
  const q = QUESTIONS[idx];
  return send(res, `${prefix} שאלה מספר ${state.index + 1}. ${q.q} אפשרות ראשונה ${q.a[0]}. אפשרות שנייה ${q.a[1]}. אפשרות שלישית ${q.a[2]}. אפשרות רביעית ${q.a[3]}. הקישו אחת עד ארבע.`, { name: "Answer", min: 1, max: 1, timeout: 8 });
}
async function answerQuiz(res, key, state, answer) {
  const q = QUESTIONS[state.current];
  if (!/^[1-4]$/.test(answer)) return quizQuestion(res, key, state, "בחירה לא תקינה.");
  const correct = Number(answer) === q.correct;
  if (correct) state.score++;
  state.index++;
  return quizQuestion(res, key, state, correct ? "תשובה נכונה." : "לא נכון. " + q.explain);
}
async function startWar(res, key) {
  const deck = shuffledDeck();
  const state = { mode: "war", player: deck.slice(0, 26), bot: deck.slice(26), wins: 0, rounds: 0 };
  await save(key, state);
  return playWar(res, key, state);
}
async function playWar(res, key, state) {
  if (!state.player.length || !state.bot.length || state.rounds >= 10) {
    const result = state.wins > state.rounds / 2 ? "ניצחתם את הבוט." : state.wins < state.rounds / 2 ? "הבוט ניצח." : "המשחק הסתיים בתיקו.";
    await redis("DEL", key);
    return send(res, `המשחק הסתיים לאחר ${state.rounds} סיבובים. ${result} ניצחתם ב ${state.wins} סיבובים. לתפריט הראשי הקישו כוכבית.`);
  }
  const p = state.player.shift(), b = state.bot.shift();
  state.rounds++;
  let outcome;
  if (p.rank > b.rank) { state.wins++; outcome = "הקלף שלכם גבוה יותר. ניצחתם בסיבוב."; }
  else if (p.rank < b.rank) outcome = "הקלף של הבוט גבוה יותר. הבוט ניצח בסיבוב.";
  else outcome = "יצא תיקו בסיבוב.";
  state.player.push(p); state.bot.push(b);
  await save(key, state);
  return send(res, `סיבוב ${state.rounds}. הקלף שלכם: ${cardName(p)}. קלף הבוט: ${cardName(b)}. ${outcome} לניסיון נוסף הקישו 1, לתפריט הראשי הקישו כוכבית.`, { name: "wm_nav", min: 1, max: 1, timeout: 8 });
}
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, "שיטת בקשה לא נתמכת.");
  const url = getUrl(req);
  const values = new URLSearchParams(url.search);
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    for (const [k, v] of Object.entries(req.body)) if (!values.has(k)) values.set(k, String(v));
  }
  const star = [...values.values()].some(v => String(v).includes("*"));
  if (star) {
    try { await redis("DEL", "game:" + phoneKey(url)); } catch {}
    return send(res, menu());
  }
  const key = "game:" + phoneKey(url);
  const choice = getDigits(url, ["wm_nav", "Choice", "ApiPhoneInput", "Digits", "val"]);
  const answer = getDigits(url, ["Answer", "ApiPhoneInput"]);
  try {
    let state = await load(key);
    if (state?.mode === "quiz") return answerQuiz(res, key, state, answer || choice);
    if (state?.mode === "war") {
      if (choice === "1") return playWar(res, key, state);
      return send(res, "למשחק מלחמה הקישו 1. לתפריט הראשי הקישו כוכבית.", { name: "wm_nav", min: 1, max: 1 });
    }
    if (choice === "1") return startQuiz(res, key);
    if (choice === "2") return startWar(res, key);
    if (choice === "3") return send(res, "בטריוויה עונים על חמש שאלות וצוברים נקודות. במשחק מלחמה מקבלים קלף מול קלף של הבוט, והקלף הגבוה מנצח. אין כסף, הימורים או רכישות במשחק. לתפריט הקישו כוכבית.");
    return send(res, menu(), { name: "wm_nav", min: 1, max: 1, timeout: 5 });
  } catch (error) {
    if (error.message === "REDIS_NOT_CONFIGURED") return send(res, "המשחק עדיין לא הוגדר במלואו. יש להגדיר ב Vercel את משתני Upstash Redis. לאחר ההגדרה נסו שוב.");
    return send(res, "אירעה תקלה זמנית בשמירת המשחק. נסו שוב בעוד רגע או חזרו לתפריט הראשי בהקשת כוכבית.");
  }
}
