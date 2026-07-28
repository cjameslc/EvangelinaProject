// Guest Response Cheat Sheet — sourced verbatim from Evangelina's
// Staycation's real Master FAQ (provided 2026-07-27). Every answer here is
// the actual business's real policy/rate/contact info, not AI-generated —
// this is exactly the "source of truth" data the cheat sheet exists to make
// quickly copyable, so nothing here should ever be paraphrased into
// something the real FAQ didn't say.

export type FaqCategory = { id: string; label: string; emoji: string };

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: "legitimacy", label: "Legitimacy & Booking Security", emoji: "🛡️" },
  { id: "rates", label: "Rates, Downpayment & Booking", emoji: "💰" },
  { id: "location", label: "Location & Check-In", emoji: "📍" },
  { id: "amenities", label: "Inclusions & Amenities", emoji: "🛏️" },
  { id: "parking", label: "Parking & House Rules", emoji: "🚗" },
  { id: "occasions", label: "Occasions & Room Setup", emoji: "🎂" },
  { id: "checkinout", label: "Check-In & Check-Out Instructions", emoji: "🔑" },
  { id: "emergency", label: "Emergency Hotlines", emoji: "📞" },
];

export type FaqEntry = {
  id: string;
  categoryId: string;
  question: string;
  answer: string; // Standard — the real answer, verbatim
  short: string; // A trimmed summary of the SAME real facts — never a new claim
  keywords: string[]; // extra search terms beyond the question/answer text itself
};

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "legit",
    categoryId: "legitimacy",
    question: "Legit po ba kayo? Baka po ma-scam kami?",
    answer: `Yes sir/ma'am, we are 100% legit! Para sa inyong peace of mind, pwede niyo rin po kaming i-book sa Airbnb. May 5 official units po kami na verified ng platform. Pwede ninyong i-check ang aming mga listings dito:
🔗 Unit 1116: https://www.airbnb.com/h/unit1116
🔗 Unit 1117: https://www.airbnb.com/h/unit1117
🔗 Unit 1845: https://www.airbnb.com/h/unit1845
🔗 Unit 1558: https://www.airbnb.com/h/unit1558
🔗 Unit 2045: https://www.airbnb.com/h/unit2045`,
    short: "Opo, 100% legit po kami — may 5 verified Airbnb listings po kami na pwede niyo ring i-book para sa peace of mind.",
    keywords: ["scam", "legit", "verified", "airbnb", "trust"],
  },
  {
    id: "rates",
    categoryId: "rates",
    question: "Magkano ang updated rates ninyo para sa staycation?",
    answer: `Ang ating regular rates para sa 2 Pax ay:
Weekdays (Monday to Thursday):
• ₱1,499 – 12 hours stay
• ₱1,699 – 21 hours stay
Weekends (Friday to Sunday):
• ₱1,699 – 12 hours stay
• ₱1,899 – 21 hours stay`,
    short: "Weekdays: ₱1,499 (12h) / ₱1,699 (21h). Weekends (Fri-Sun): ₱1,699 (12h) / ₱1,899 (21h). 2 pax.",
    keywords: ["price", "rate", "magkano", "cost", "12 hours", "21 hours", "weekday", "weekend"],
  },
  {
    id: "downpayment",
    categoryId: "rates",
    question: "Magkano po ang downpayment at paano ang bayaran?",
    answer: "Ang downpayment po natin ay ₱500 para ma-reserve ang inyong slot at unit. Ang full payment o yung natitirang balanse ay babayaran na po upon check-in.",
    short: "₱500 reservation fee to hold the slot; the remaining balance is paid on check-in.",
    keywords: ["downpayment", "dp", "reservation fee", "gcash", "payment"],
  },
  {
    id: "gcash",
    categoryId: "rates",
    question: "Paano po magbayad ng reservation fee / GCash details?",
    answer: `Sure po! 😊 You may send the ₱500 reservation fee via GCash to:
📱 GCash Number: 09696262525
👤 Account Name: Carl James Carampot
Once the payment has been sent, kindly send us a screenshot or proof of payment po so we can verify and confirm your reservation. Thank you po! 🏡💙`,
    short: "GCash: 09696262525 (Carl James Carampot), ₱500. Please send proof of payment/screenshot to confirm.",
    keywords: ["gcash", "payment", "proof", "screenshot", "pay", "bayad"],
  },
  {
    id: "deposit",
    categoryId: "rates",
    question: "May security deposit po ba na kailangang iwan?",
    answer: "Wala po kaming hiwalay na security deposit! Ang inyong ₱500 reservation fee ay bawas na at kasama na mismo sa kabuuang presyo ng unit.",
    short: "No separate security deposit — the ₱500 reservation fee is deducted from the total.",
    keywords: ["deposit", "security"],
  },
  {
    id: "fixed-flexible",
    categoryId: "rates",
    question: 'Ano ang pinagkaiba ng "Fixed Time" at "Flexible Time" booking?',
    answer: "Fixed Time: Pipili lang kayo sa mga available time slots na nakasaad sa aming schedule nang walang extra charge.\nFlexible Time: Kung hindi tugma ang fixed slots sa schedule ninyo, maaari ninyong i-adjust o i-extend ang inyong booking check-in/check-out hours sa halagang ₱150.",
    short: "Fixed = pick from listed time slots, no extra fee. Flexible = custom check-in/out time, +₱150.",
    keywords: ["fixed", "flexible", "time", "schedule"],
  },
  {
    id: "extension",
    categoryId: "rates",
    question: "How much po magpa-extend kung bitin pa kami sa stay?",
    answer: "Ang add-on rate para sa extension ay ₱100 bawat oras. ⚠️ Paki-coordinate po agad sa aming management team kung balak ninyong mag-extend para ma-check kung available pa ang slot.",
    short: "₱100/hour extension — coordinate with the team first to check if the slot is still available.",
    keywords: ["extend", "extension", "overtime", "add-on"],
  },
  {
    id: "location",
    categoryId: "location",
    question: "Saan po ang location ninyo? Ano ang ilalagay sa Grab?",
    answer: "Ang aming location ay sa Urban Deca Towers Cubao. Para sa mga magbu-book ng ride (Grab/JoyRide) o magpapadeliver, ang gagamiting pin ay: Urban Deca Towers Cubao.",
    short: "Urban Deca Towers Cubao — use this as the Grab/delivery pin.",
    keywords: ["location", "address", "grab", "pin", "where", "saan"],
  },
  {
    id: "checkin-process",
    categoryId: "location",
    question: "Paano po ang proseso ng pag-check in? May sasalubong ba sa amin?",
    answer: "Napakadali at hassle-free po! Sa araw ng inyong check-in, may susundo po sa inyo sa lobby para ihatid kayo sa unit at ibigay ang inyong tap card access.",
    short: "Hassle-free — someone meets you at the lobby on check-in day and walks you to the unit with your tap card.",
    keywords: ["check-in", "checkin", "process", "lobby"],
  },
  {
    id: "inclusions",
    categoryId: "amenities",
    question: "Ano ang inclusions sa loob ng unit?",
    answer: "Bed: Comfortable Queen-size bed. Aircon: Malamig na Carrier 1 HP Aircon. Entertainment: 50-inch Smart TV na may Free Netflix, HBO, Amazon Prime and Vivamax access. Games: Free use ng board games, chess, at playing cards. Drinks: Free filtered water at free coffee!",
    short: "Queen bed, 1HP aircon, 50\" Smart TV (Netflix/HBO/Prime/Vivamax), board games, free water & coffee.",
    keywords: ["inclusions", "amenities", "tv", "netflix", "aircon", "bed", "wifi"],
  },
  {
    id: "toiletries",
    categoryId: "amenities",
    question: "Nagpo-provide ba kayo ng toiletries at towels?",
    answer: "Yes, meron po! Kasama na po sa inyong stay ang malilinis na towels at guest kits (soap, toothpaste, toothbrush, shampoo, at tissue).",
    short: "Yes — clean towels and a guest kit (soap, toothpaste, toothbrush, shampoo, tissue) included.",
    keywords: ["towel", "toiletries", "soap", "shampoo", "guest kit"],
  },
  {
    id: "cooking",
    categoryId: "amenities",
    question: "Pwede po bang magluto sa loob ng unit?",
    answer: "Yes po, pwedeng-pwede! Nagpo-provide kami ng multipurpose cooker para sa inyong simpleng pagluluto, at may basic condiments na rin tulad ng salt and pepper.",
    short: "Yes — a multipurpose cooker plus basic condiments (salt & pepper) are provided.",
    keywords: ["cook", "kitchen", "luto", "cooker"],
  },
  {
    id: "parking",
    categoryId: "parking",
    question: "May parking space po ba para sa sasakyan o motor?",
    answer: "Yes, meron pong paid parking sa building. Kung may dalang sasakyan, paki-contact po kami agad bago ang check-in dahil may karagdagang bayad ito:\nCar (Kotse): ₱400\nMotorcycle (Motor): ₱300",
    short: "Paid parking available — ₱400/car, ₱300/motorcycle. Contact us before check-in to reserve.",
    keywords: ["parking", "car", "motor", "kotse"],
  },
  {
    id: "age-limit",
    categoryId: "parking",
    question: "Pwede po ba ang minor o may age limit ba ang guests?",
    answer: "No age limit po! Welcome na welcome po ang lahat sa ating unit—bata, matanda, o minors, pwedeng-pwede mag-staycation dito.",
    short: "No age limit — minors and all ages are welcome.",
    keywords: ["minor", "age", "kids", "children"],
  },
  {
    id: "pets",
    categoryId: "parking",
    question: "Pwede po ba magdala ng alagang hayop / pets?",
    answer: "Pets are allowed po sa Evangelina's Staycation!",
    short: "Yes, pets are allowed.",
    keywords: ["pet", "dog", "cat", "hayop", "alaga"],
  },
  {
    id: "pool-gym",
    categoryId: "parking",
    question: "May pool o gym ba sa building?",
    answer: "Wala pong pool at gym sa mismong building. Pero napaka-convenient ng ating lokasyon dahil walking distance tayo sa mga shopping malls sa Cubao, at sa baba mismo ng building ay makikita ang: Alphamart (for grocery & snack needs), Food Court (kung ayaw ninyong magluto), Coffee Shop at Laundry Area.",
    short: "No pool/gym in the building, but walking distance to Cubao malls — ground floor has Alphamart, a food court, coffee shop, and laundry.",
    keywords: ["pool", "gym", "facilities", "mall"],
  },
  {
    id: "occasion-setup",
    categoryId: "occasions",
    question: "Pwede po ba magpa-setup ng design para sa Birthday o Anniversary?",
    answer: "Yes, pwedeng-pwede po natin i-surprise ang inyong loved ones! Nag-ooffer kami ng simple room design setup sa halagang ₱1,300 lamang (kasama na ang setup fee). Kasama na sa package ang: Happy Birthday / Anniversary Banner, Balloons, Cake 🎂",
    short: "Yes — ₱1,300 room setup package includes a banner, balloons, and a cake.",
    keywords: ["birthday", "anniversary", "setup", "balloons", "cake", "surprise", "occasion"],
  },
  {
    id: "before-checkin",
    categoryId: "checkinout",
    question: "Ano ang mga kailangang ipasa o ihanda BAGO ang check-in day?",
    answer: "🚨 Kailangan niyo pong isend sa amin nang maaga ang mga valid ID ng lahat ng papasok sa unit bago ang inyong check-in. Requirements po ito ng admin para sa kanilang approval.",
    short: "Send valid IDs of all guests before check-in day — required by building admin.",
    keywords: ["id", "requirements", "before", "valid id"],
  },
  {
    id: "checkin-steps",
    categoryId: "checkinout",
    question: "Paano po ang step-by-step na pagpapasok sa building at pag-akyat sa unit?",
    answer: `1. Building Entry: Pumasok po sa main lobby na nakaharap sa EDSA.
2. Sa Security Guard: Sabihin po sa guard kung anong floor kayo mag-checheck in. Ipakita ang inyong booking confirmation at isang (1) valid ID para sa bawat guest. Humingi po ng guest form at sagutan ito. Host Name na ilalagay: Carl James Carampot. Note: Maaaring itago muna ng guard ang isang valid ID ninyo para sa building security.
3. Elevator Access (RFID Tap Card): Sasalubungin po namin kayo sa lobby para iabot nang personal ang inyong RFID tap card (kailangan ito para magamit ang elevator pataas).`,
    short: "Enter via the main lobby (EDSA side), show booking confirmation + valid ID to the guard (host name: Carl James Carampot), then we meet you to hand over the RFID tap card.",
    keywords: ["lobby", "guard", "id", "rfid", "elevator", "steps", "entry"],
  },
  {
    id: "checkout-steps",
    categoryId: "checkinout",
    question: "Paano po ang proseso kapag mag-checheck out na kami?",
    answer: "Madali lang po: Iwanan lamang po ang RFID tap card sa loob mismo ng kwarto bago kayo umalis.",
    short: "Just leave the RFID tap card inside the unit before you leave.",
    keywords: ["checkout", "check-out", "rfid", "leave"],
  },
  {
    id: "emergency",
    categoryId: "emergency",
    question: "Sino po ang pwedeng tawagan kung may kailangan habang nasa unit na?",
    answer: `Kung kayo po ay nasa building na at nangangailangan ng tulong, o kung may mga tanong kayo habang kayo ay nag-iistay, maaari ninyong tawagan ang mga sumusunod:
• Para sa pagsalubong / Housekeeping assistance (Jj): 📱 0995 783 3318 / 0960 674 2136
• Jeff: 📱 0977 606 2897
• James: 📱 0976 001 6381`,
    short: "Jj (housekeeping/greeting): 0995 783 3318 / 0960 674 2136 · Jeff: 0977 606 2897 · James: 0976 001 6381",
    keywords: ["emergency", "hotline", "call", "contact", "tawag", "number"],
  },
];

// Per-unit door code / WiFi — a distinct, staff-only quick-reference (not
// mixed into the searchable FAQ answers above) since this is real access
// data, not general information. Kept in sync with the real Unit records
// (Admin -> Units) rather than duplicated as static text — see
// UNIT_REFERENCE_NOTE below for why there's no hardcoded copy here.
export const UNIT_REFERENCE_NOTE =
  "Door codes and WiFi are per-unit and already stored on each Unit record (Admin → Units, the same data the Guest Portal's Digital Guidebook uses) — shown live below rather than duplicated as static text here, so this page can never show a stale code after Admin updates one.";
