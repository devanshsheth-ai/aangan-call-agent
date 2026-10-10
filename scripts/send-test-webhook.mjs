// Pretends to be Vaani: sends call_started then call_postprocessing to your app.
//   npm run test:webhook                                       (local app on :3000, qualified call)
//   npm run test:webhook -- --scenario complaint
//   npm run test:webhook -- --url https://your-app.vercel.app --scenario pricing
// Scenarios: qualified | pricing | complaint | notfit
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = (opt("url", process.env.APP_URL || "http://localhost:3000")).replace(/\/+$/, "");
const scenario = opt("scenario", "qualified");
const secret = process.env.VAANI_WEBHOOK_SECRET;
if (!secret) { console.error("VAANI_WEBHOOK_SECRET is not set in .env.local"); process.exit(1); }

const T = {
  qualified: [
    "AGENT: Namaste, Aangan Studio, this is Vaani. How can I help?",
    "USER: Hi, I just got possession of a 3BHK in Baner, about 1400 square feet. I want full interiors, modular kitchen and wardrobes.",
    "AGENT: Lovely. When would you like to move in?",
    "USER: In about three months. My wife and I decide together and she will join the meeting.",
    "AGENT: Great. Shall I book a consultation with a designer, say Saturday at 11 am?",
    "USER: Saturday at 11 works.",
  ],
  pricing: [
    "AGENT: Namaste, Aangan Studio, this is Vaani. How can I help?",
    "USER: Hello, I am in Kothrud, 2BHK, 950 sq ft, want complete interiors in two months. What is your rate per square foot?",
    "AGENT: Pricing depends on the design and materials, so our designer will go through it with you at the consultation. Would Sunday afternoon suit you?",
    "USER: Okay, Sunday 3 pm.",
  ],
  complaint: [
    "AGENT: Namaste, Aangan Studio, this is Vaani. How can I help?",
    "USER: I am an existing client. The wardrobe your team installed last week has a crack and nobody has called me back. This is unacceptable.",
    "AGENT: I am sorry to hear that. I will pass this to our team right away.",
  ],
  notfit: [
    "AGENT: Namaste, Aangan Studio, this is Vaani. How can I help?",
    "USER: I have a flat in Nashik and want full interiors.",
    "AGENT: Thanks for calling. We currently work only in Pune and Pimpri-Chinchwad.",
  ],
};
if (!T[scenario]) { console.error(`Unknown scenario. Pick one of: ${Object.keys(T).join(", ")}`); process.exit(1); }

const room = `test-${Date.now()}`;
const url = `${base}/api/vaani/webhook?token=${encodeURIComponent(secret)}`;
const send = async (label, body) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log(`${label}: HTTP ${res.status} ${await res.text()}`);
  return res.ok;
};

const stamp = (i) => `[10:${String(i).padStart(2, "0")}:00]`;
const transcript = T[scenario].map((l, i) => `${stamp(i)} ${l}`).join("\n\n");

console.log(`Sending a "${scenario}" test call to ${base} (room ${room})\n`);
if (!(await send("call_started       ", { event: "call_started", room_name: room, status: "started", phone_number: "+919000000001" }))) process.exit(1);
await new Promise((r) => setTimeout(r, 1000));
const ok = await send("call_postprocessing", {
  event: "call_postprocessing",
  call_id: `pp-${room}`,
  timestamp: new Date().toISOString(),
  data: { room_name: room, call_duration: 95000, end_reason: "customer_hangup", summary: "Test call", entities: {}, dispositions: {}, recording_url: null, transcript },
});
console.log(ok ? "\nDone. Check the dashboard and your inbox." : "\nThe app returned an error. Check the Vercel logs (or the terminal running npm run dev).");
process.exit(ok ? 0 : 1);
