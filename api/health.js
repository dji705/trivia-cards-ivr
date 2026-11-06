export default function handler(req, res) {
  res.status(200).json({ ok: true, service: "trivia-cards-ivr", version: "1.0.0" });
}
