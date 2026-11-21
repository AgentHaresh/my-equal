import type { Contact, DB, Memory, Message } from "./store";

/**
 * The sample life every new account starts with, so each feature has something real to show.
 * It is one person's ordinary month: a brother he has drifted from, a father who needs looking
 * after, a sister preparing for a visa interview, a close friend planning a trip, a colleague,
 * and a landlord. Chats are in the mix of Telugu and English that people actually type.
 *
 * Every date is relative to "now", so the reminders and nudges are always current:
 *  - Don't forget: one overdue, one due today, two due tomorrow
 *  - Stay close:   Anna (22 days, usually every 3) and Priya (9 days, usually every 2)
 *  - Follow up:    Ravi's sister's engagement
 *  - Ask me:       rent, the visa interview, Nanna's tablets, the trip, a birthday
 */

const DAY = 86400000;
const IST_MS = 5.5 * 3600000;

type Line = [daysAgo: number, time: string, from: "me" | "them", text: string];

export function sampleSpace(now = Date.now()): DB {
  let n = 0;
  const id = () => `s${(n++).toString(36)}`;
  // A moment "daysFromNow" days from today at a given Indian clock time.
  const at = (daysFromNow: number, time: string) => {
    const day = new Date(now + IST_MS + daysFromNow * DAY).toISOString().slice(0, 10);
    return new Date(`${day}T${time}:00+05:30`).toISOString();
  };

  const messages: Message[] = [];
  const contacts: Contact[] = [];
  const person = (c: Omit<Contact, "lastContactAt" | "sample">, lines: Line[]) => {
    for (const [daysAgo, time, from, text] of lines) messages.push({ id: id(), contactId: c.id, from, text, at: at(-daysAgo, time) });
    const last = lines.length ? at(-lines[lines.length - 1][0], lines[lines.length - 1][1]) : new Date(now).toISOString();
    contacts.push({ ...c, sample: true, relationSource: "user", lastContactAt: last });
  };

  person({ id: "ravi", name: "Ravi", relation: "close friend", close: true }, [
    [6, "20:10", "them", "Srisailam trip plan cheddam ra, long weekend ki?"],
    [6, "20:14", "me", "Done ra. Nenu stay options chusta."],
    [5, "13:02", "them", "Car lo veldama, bus aa?"],
    [5, "13:05", "me", "Car lo veldam, nenu drive chesta. Morning 5 ki start."],
    [4, "18:40", "them", "Infosys interview ichha ra. Results next week antunnaru."],
    [4, "18:43", "me", "Vastundi le, tension padaku. Party nuvve ivvali."],
    [3, "09:15", "them", "Akka engagement Wednesday, Kukatpally lo. Vastunnav kada?"],
    [3, "09:20", "me", "Miss avvanu ra, family tho vasta."],
    [2, "21:30", "them", "Interview went okay I think. HR round baga jarigindi."],
    [1, "19:05", "me", "Hotel shortlist pampistha, konchem time ivvu."],
    [1, "19:07", "them", "No hurry ra. Haritha resort try chey, river view untundi."],
  ]);

  person({ id: "kiran", name: "Kiran", relation: "colleague", close: false }, [
    [3, "11:20", "them", "Client review is confirmed. Can you take the pricing section?"],
    [3, "11:26", "me", "Yes, I'll prepare it. Send me last quarter's numbers."],
    [2, "16:45", "them", "Shared the sheet. Also please send the revised proposal before the review."],
    [2, "16:50", "me", "Will do."],
    [1, "10:05", "them", "Thanks. Lunch after the review, my treat."],
  ]);

  person({ id: "nanna", name: "Nanna", relation: "father", close: true }, [
    [10, "08:30", "them", "Pension credit ayyinda chudu nanna, message raaledu."],
    [10, "08:41", "me", "Chusta Nanna, bank app lo check chesta."],
    [8, "09:10", "me", "Credit ayyindi Nanna, 5th na vachindi."],
    [8, "09:18", "them", "Sare. BP tablets aipotunnayi, Telma 40. Inka 4 rojulake unnayi."],
    [6, "19:02", "me", "Order chesa Nanna, repu vastayi."],
    [6, "19:10", "them", "Manchidi. Evaro bank nunchi ani phone chesaru, KYC update antunnaru."],
    [6, "19:12", "me", "Alanti calls ki emi cheppaku Nanna. OTP evvariki ivvaku, nenu chuskunta."],
    [4, "12:20", "them", "Tablets vachayi. Thanks nanna."],
    [2, "18:35", "them", "Weekend intiki vastava? Amma chepala pulusu chestundi."],
    [2, "18:40", "me", "Vasta Nanna, lunch ki."],
  ]);

  person({ id: "rao", name: "Mr. Rao", relation: "landlord", close: false }, [
    [30, "10:00", "them", "Rent received, thank you."],
    [5, "17:30", "them", "Water tank cleaning on Sunday morning. Please keep the taps closed from 7 to 10."],
    [5, "17:42", "me", "Sure, thanks for informing."],
    [1, "09:00", "them", "Reminder: rent 18,500 is due on the 5th. Maintenance 2,000 is separate this month."],
    [1, "09:12", "me", "Noted, will transfer."],
  ]);

  person({ id: "priya", name: "Priya", relation: "sister", close: true }, [
    [21, "14:05", "them", "Anna! Visa interview slot dorikindi, Chennai consulate lo."],
    [21, "14:08", "me", "Super ra! Date eppudu?"],
    [19, "20:15", "them", "December 3rd, morning 9:30 ki. DS-160 kuda submit chesa."],
    [19, "20:20", "me", "Documents anni oka folder lo pettuko."],
    [17, "11:30", "them", "Bank statement kavali, Nanna account di. 6 months."],
    [17, "11:36", "me", "Nenu Nanna tho matladi pampistha."],
    [15, "19:50", "me", "Statement pampincha, mail check chey."],
    [15, "19:58", "them", "Vachindi, thanks Anna!"],
    [13, "22:10", "them", "Mock interview icha, konchem nervous ga undi."],
    [13, "22:14", "me", "Nuvvu baga chestav. Short answers ivvu, anthe."],
    [11, "16:40", "them", "Flight tickets rates perigipotunnayi, eppudu book cheyali?"],
    [11, "16:45", "me", "Visa vachaka book cheddam, mundu kadu."],
    [9, "21:00", "them", "Sare. Weekend call chey, Amma tho kuda matladali antondi."],
    [9, "21:03", "me", "Chesta."],
  ]);

  person({ id: "anna", name: "Anna", relation: "brother", close: true }, [
    [40, "19:30", "them", "Ra, pandaga ki intiki vastunnava? Amma adugutondi."],
    [40, "19:34", "me", "Vastanu Anna, tickets chustunna."],
    [37, "08:50", "them", "Nanna BP reports pampinchu, ikkada cardiologist ki chupista."],
    [37, "08:55", "me", "Sare Anna, scan chesi pampistha."],
    [34, "21:15", "me", "Anna, Chinni birthday eppudu? Gift pampali."],
    [34, "21:22", "them", "December 2nd ra. Cycle kavali antondi, pink colour."],
    [31, "13:10", "them", "Office ela undi? Promotion gurinchi emaina chepparaa?"],
    [31, "13:18", "me", "Inka ledu Anna, January lo review antunnaru."],
    [28, "20:05", "me", "Tickets book chesa, night train."],
    [28, "20:09", "them", "Super. Station ki nenu vasta."],
    [25, "18:20", "them", "Eyes konchem blur ga unnayi ra, check cheyinchukovali."],
    [25, "18:25", "me", "LV Prasad ki vellu Anna, delay cheyaku."],
    [22, "09:40", "them", "Thursday eye check-up undi ra, LV Prasad lo. Don't worry."],
    [22, "09:45", "me", "Ok Anna, tell me how it goes."],
  ]);

  // A number that is not in contacts, with one ordinary message already in it.
  messages.push({ id: id(), contactId: "unknown-me", from: "them", text: "Hi, your Blue Dart parcel will be delivered today between 2 and 5 PM.", at: at(-1, "11:00") });
  contacts.push({ id: "unknown-me", sample: true, name: "+91 90000 12345", relation: "not in contacts", close: false, lastContactAt: at(-1, "11:00"), unknown: true });
  // The same, on a protected family member's phone. Scam messages and calls sent here raise an alert.
  contacts.push({ id: "unknown-nanna", sample: true, name: "+91 98765 00000", relation: "not in contacts", close: false, lastContactAt: at(-12, "10:00"), unknown: true, owner: "Nanna" });

  // The most recent Thursday before today, for Anna's check-up.
  const thursday = (() => {
    const d = new Date(now + IST_MS);
    do d.setUTCDate(d.getUTCDate() - 1);
    while (d.getUTCDay() !== 4);
    return new Date(`${d.toISOString().slice(0, 10)}T11:00:00+05:30`).toISOString();
  })();

  const remember = (contactId: string, fact: string, extra: Partial<Memory> = {}): Memory => ({
    id: id(),
    contactId,
    fact,
    kind: "event",
    about: "contact",
    when: null,
    status: "open",
    createdAt: at(-1, "09:00"),
    sample: true,
    ...extra,
  });

  const memories: Memory[] = [
    // Things about the people in my life
    remember("anna", "Eye check-up at LV Prasad", { when: thursday }),
    remember("anna", "Chinni, Anna's daughter, has her birthday on 2 December and wants a pink cycle", { kind: "preference", createdAt: at(-34, "21:22") }),
    remember("ravi", "Ravi's sister's engagement in Kukatpally", { when: at(-3, "18:00") }),
    remember("ravi", "Waiting for Infosys interview results", { kind: "worry" }),
    remember("ravi", "Srisailam trip by car, leaving at 5 in the morning; Ravi suggests Haritha resort for the river view", { kind: "preference" }),
    remember("priya", "US visa interview at the Chennai consulate on 3 December at 9:30 am", { kind: "event" }),
    remember("priya", "Nervous about the visa interview after a mock interview", { kind: "worry" }),
    remember("nanna", "Takes Telma 40 for blood pressure", { kind: "preference" }),
    remember("nanna", "Got a call claiming to be from the bank about a KYC update", { kind: "worry" }),
    remember("rao", "Rent is ₹18,500, due on the 5th; maintenance of ₹2,000 is separate this month", { kind: "preference" }),
    remember("kiran", "Lunch with Kiran after the client review", { kind: "preference" }),
    // My own commitments: these appear under "Don't forget"
    remember("anna", "Send Nanna's BP reports to Anna", { about: "user", kind: "promise", when: at(-1, "00:00") }),
    remember("priya", "Call Priya, and let her talk to Amma", { about: "user", kind: "promise", when: at(0, "00:00") }),
    remember("kiran", "Client review with Kiran's team: take the pricing section", { about: "user", when: at(1, "11:00"), timed: true }),
    remember("ravi", "Send Ravi the hotel shortlist for the Srisailam trip", { about: "user", kind: "promise", when: at(1, "00:00") }),
  ];

  return { contacts, messages, memories, suggestions: [], dismissed: [], gateLog: [], jobs: [], screens: [] };
}
