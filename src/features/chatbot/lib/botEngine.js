import { KB, INTENTS, SYMPTOM_MAP } from '../data/knowledgeBase'
import { MENTAL_HEALTH_RESPONSES, MENTAL_HEALTH_FOLLOW_UPS, MENTAL_HEALTH_INTENTS } from '../data/mentalHealthResponses'

const DISCLAIMER = '<div class="chat-disclaimer">⚠️ <em>This is for informational purposes only and is not a substitute for professional medical advice. Always consult a healthcare provider for proper diagnosis and treatment.</em></div>'

// Tap-to-call link for the clinic's number — used everywhere this file
// mentions it, instead of a plain <strong> string, so it's consistently
// a real link in every reply rather than only some of them. +639076842769
// is the E.164 form of 0907-684-2769 (leading 0 replaced with the
// Philippines country code +63) — tel: links work more reliably across
// devices/OSes in that normalized form than a locally-formatted number
// with dashes.
const PHONE_LINK = '<a href="tel:+639076842769"><strong>0907-684-2769</strong></a>'

// Shown on any emergency-level rule-based reply so the person always sees
// the fastest way to actually alert the clinic, not just read guidance
// text. Mirrors the wording already used on the AI-model path (see
// EMERGENCY_REPLY / SYSTEM_PROMPT in supabase/functions/chat-completion)
// and the two real triggers that already exist in the app: typing "sos"
// in this chatbox (see isSosTrigger in ChatbotPage.jsx) and the SOS
// button in the Topbar.
const SOS_CALLOUT = '<div class="chat-emergency-box">🆘 You can type <strong>SOS</strong> here to open the Emergency Alert form directly, or tap the <strong>SOS</strong> button at the top of the screen.</div>'

// Lightweight "pattern recognition" for the rule-based fallback (Phase 2)
// — reuses SYMPTOM_MAP's own keys as the canonical symptom vocabulary
// rather than a second, separately-maintained keyword list. Genuinely
// lightweight: a couple of substring checks against however many past
// messages were already loaded (ChatbotPage caps this at a small N), not
// any kind of NLP/similarity matching.
const SYMPTOM_NAMES = Object.keys(SYMPTOM_MAP)

function daysBetween(isoA, isoB) {
  return Math.abs(new Date(isoA) - new Date(isoB)) / (1000 * 60 * 60 * 24)
}

/**
 * If the current message mentions a known symptom AND that same symptom
 * appears in one of the user's own past messages (from an earlier
 * session — `pastMessages` never includes the current one), returns a
 * short callback sentence referencing it. Otherwise null. Picks the
 * single most recent matching past mention, not every one that ever
 * matched, to keep the callback concise.
 */
export function checkPastMentions(msg, pastMessages) {
  if (!pastMessages || pastMessages.length === 0) return null
  const lower = msg.toLowerCase()
  const mentionedNow = SYMPTOM_NAMES.filter((s) => lower.includes(s))
  if (mentionedNow.length === 0) return null

  for (const symptom of mentionedNow) {
    const priorMatch = pastMessages.find((m) => m.text.toLowerCase().includes(symptom))
    if (priorMatch) {
      const days = Math.round(daysBetween(new Date().toISOString(), priorMatch.ts))
      const when = days <= 0 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`
      return `<div class="chat-callback">💭 <em>By the way, you mentioned ${symptom} ${when} too — is this the same issue, or something new?</em></div>`
    }
  }
  return null
}

/**
 * Builds a plain-language SUMMARY of symptom keywords the person has
 * mentioned across their chat history — NOT a diagnosis or medical
 * prediction. Deliberately framed as "here's what you've told me," with
 * counts and recency, so it's genuinely useful for noticing a recurring
 * pattern (e.g. "you've mentioned headache 4 times this month") without
 * ever claiming to assess, diagnose, or predict anything medically.
 */
function buildHealthSummary(allMessages) {
  if (!allMessages || allMessages.length === 0) {
    return `📊 <strong>Your Health Summary</strong><br><br>
    I don't have any past messages to look back on yet — once you've chatted with me a bit about how you're feeling, I can summarize any patterns I notice.<br><br>${DISCLAIMER}`
  }

  const tally = {} // symptom -> { count, mostRecent }
  for (const m of allMessages) {
    const lower = (m.text || '').toLowerCase()
    for (const symptom of SYMPTOM_NAMES) {
      if (lower.includes(symptom)) {
        if (!tally[symptom]) tally[symptom] = { count: 0, mostRecent: m.ts }
        tally[symptom].count++
        if (new Date(m.ts) > new Date(tally[symptom].mostRecent)) tally[symptom].mostRecent = m.ts
      }
    }
  }

  const entries = Object.entries(tally).sort((a, b) => b[1].count - a[1].count)

  if (entries.length === 0) {
    return `📊 <strong>Your Health Summary</strong><br><br>
    I looked back through your chat history and didn't find any specific symptoms mentioned — that's good news! If something's bothering you, feel free to describe it anytime.<br><br>${DISCLAIMER}`
  }

  const rows = entries
    .slice(0, 6)
    .map(([symptom, { count, mostRecent }]) => {
      const days = Math.round(daysBetween(new Date().toISOString(), mostRecent))
      const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
      const label = symptom.charAt(0).toUpperCase() + symptom.slice(1)
      return `<div class="info-row"><span>${label}</span><span>Mentioned ${count}× · last ${when}</span></div>`
    })
    .join('')

  const flagged = entries.find(([, v]) => v.count >= 3)
  const flagNote = flagged
    ? `<br>💡 <strong>${flagged[0].charAt(0).toUpperCase() + flagged[0].slice(1)}</strong> has come up ${flagged[1].count} times — if this keeps recurring, it may be worth a proper check-up with clinic staff rather than just chatting about it here.`
    : ''

  return `📊 <strong>Your Health Summary</strong><br><br>
  Based on what you've told me in our conversations, here's what's come up:<br><br>
  <div class="chat-info-box">${rows}</div>
  ${flagNote}<br><br>
  ⚠️ <em>This is a simple summary of what you've mentioned to me — it is <strong>not</strong> a diagnosis, assessment, or medical prediction. Only a healthcare provider can properly evaluate your symptoms.</em>`
}

// Chips use data-reply instead of the legacy inline onclick="sendQuickReply(...)"
// — ChatbotPage handles clicks via one delegated listener instead.
function chip(label, reply) {
  return `<span class="chip" data-reply="${reply.replace(/"/g, '&quot;')}">${label}</span>`
}
function topicChip(icon, label, reply) {
  return `<div class="topic-chip" data-reply="${reply.replace(/"/g, '&quot;')}"><span style="font-size:18px">${icon}</span><span>${label}</span></div>`
}

export function classifyIntent(msg) {
  const lower = msg.toLowerCase().trim()
  let bestMatch = null
  let bestScore = 0
  for (const intent of INTENTS) {
    for (const pat of intent.patterns) {
      if (lower.includes(pat)) {
        const score = pat.length
        if (score > bestScore) {
          bestScore = score
          bestMatch = intent.id
        }
      }
    }
  }
  return bestMatch
}

// Physical-symptom intent ids from knowledgeBase's INTENTS list — used
// alongside SYMPTOM_NAMES so single-word symptom mentions AND
// full-sentence symptom intents both count as a "health concern".
// Deliberately excludes non-symptom intents like 'health_tips',
// 'health_summary', 'doc_requirements', etc. — those are informational
// questions, not a description of what's currently wrong with someone.
const SYMPTOM_INTENT_IDS = new Set([
  'emergency', 'symptoms', 'headache', 'fever', 'colds', 'cough',
  'stomach', 'predict', 'symptom_check', 'dental', 'vaccine',
])

/**
 * True if a message is actually about a health concern — a physical
 * symptom (matches SYMPTOM_MAP's keyword list or a symptom-related
 * intent) or emotional/mental-health distress (matches
 * MENTAL_HEALTH_INTENTS). Small talk, clinic-hours questions, thanks,
 * greetings, etc. all return false. Used to decide what's worth
 * carrying into an SOS-triggered emergency description — see
 * ChatbotPage.handleSend.
 */
export function isHealthConcernMessage(text) {
  const lower = (text || '').toLowerCase()
  if (SYMPTOM_NAMES.some((s) => lower.includes(s))) return true
  const intent = classifyIntent(text)
  if (!intent) return false
  return SYMPTOM_INTENT_IDS.has(intent) || MENTAL_HEALTH_INTENTS.has(intent)
}

// NOTE: not currently called anywhere in the response flow (runSymptomAnalysis
// computes its own risk level inline) — same in the legacy source. Ported
// for parity in case a future caller needs it.
export function assessRisk(symptoms) {
  if (!symptoms.length) return null
  const highRisk = symptoms.some((s) => ['chest pain', 'difficulty breathing', 'unconscious', 'seizure', 'severe bleeding'].some((h) => s.includes(h)))
  const medRisk = symptoms.some((s) => ['fever', 'vomiting', 'diarrhea', 'rash', 'dizziness', 'stomach pain'].some((m) => s.includes(m)))
  if (highRisk) return { level: 'HIGH', color: '#DC2626', action: 'Seek immediate medical attention or go to the clinic NOW. Call 911 if severe.', icon: '🚨' }
  if (medRisk) return { level: 'MEDIUM', color: '#D97706', action: 'Visit the clinic today for proper evaluation. Monitor symptoms closely.', icon: '⚠️' }
  return { level: 'LOW', color: '#16A34A', action: 'Rest, hydrate, and monitor. Visit the clinic if symptoms persist beyond 2–3 days.', icon: '✅' }
}

function buildHealthTipResponse(symptomName, data) {
  return `💊 <strong>Health Tips for ${symptomName.charAt(0).toUpperCase() + symptomName.slice(1)}</strong><br><br>
  <strong>🌿 What you can do at home:</strong><br>
  ${data.tips.map((t) => `<div class="chat-tip-item">${t}</div>`).join('')}
  <br>
  <div class="chat-warning-box">
    <strong>🏥 When to visit the clinic:</strong><br>${data.when_to_visit}
  </div>`
}

export function runSymptomAnalysis(msg) {
  const lower = msg.toLowerCase()
  const foundSymptoms = []
  const foundConditions = []
  let overallRisk = 'low'

  for (const [symptom, data] of Object.entries(SYMPTOM_MAP)) {
    if (lower.includes(symptom)) {
      foundSymptoms.push(symptom)
      foundConditions.push(...data.conditions)
      if (data.risk === 'high') overallRisk = 'high'
      else if (data.risk === 'medium' && overallRisk !== 'high') overallRisk = 'medium'
    }
  }

  const kwMap = { head: 'headache', 'masakit ang ulo': 'headache', lagnat: 'fever', mainit: 'fever', ubo: 'cough', sipon: 'runny nose', hilab: 'vomiting', nagsusuka: 'vomiting', pagod: 'fatigue', manhid: 'fatigue' }
  for (const [kw, sym] of Object.entries(kwMap)) {
    if (lower.includes(kw) && !foundSymptoms.includes(sym)) {
      foundSymptoms.push(sym)
      if (SYMPTOM_MAP[sym]) {
        foundConditions.push(...SYMPTOM_MAP[sym].conditions)
        if (SYMPTOM_MAP[sym].risk === 'high') overallRisk = 'high'
        else if (SYMPTOM_MAP[sym].risk === 'medium' && overallRisk !== 'high') overallRisk = 'medium'
      }
    }
  }

  if (!foundSymptoms.length) {
    return `🤔 I couldn't identify specific symptoms from your message. Please describe your symptoms more specifically, for example:<br>
    <em>"I have fever, headache, and body pain since yesterday"</em><br><br>
    Or select a common concern:<br>
    <div class="chat-chips">
      ${chip('🤒 Fever', 'I have fever')}
      ${chip('🤕 Headache', 'I have headache')}
      ${chip('🤧 Cough & Colds', 'I have cough and colds')}
      ${chip('🤢 Stomach Pain', 'I have stomach pain')}
    </div>`
  }

  const riskConfig = {
    low: { label: 'LOW RISK', color: '#16A34A', bg: '#DCFCE7', icon: '✅', action: 'Rest, hydrate, and monitor your symptoms. Visit the clinic if symptoms persist beyond 2–3 days.' },
    medium: { label: 'MEDIUM RISK', color: '#D97706', bg: '#FEF3C7', icon: '⚠️', action: 'Consider visiting the clinic today for proper evaluation. Monitor your temperature and fluid intake.' },
    high: { label: 'HIGH RISK', color: '#DC2626', bg: '#FEE2E2', icon: '🚨', action: 'Seek immediate medical attention. Go to the clinic NOW or call 911 for life-threatening symptoms.' },
  }
  const rc = riskConfig[overallRisk]
  const uniqueConditions = [...new Set(foundConditions)].slice(0, 5)

  return `🩺 <strong>Symptom Analysis Report</strong><br><br>
  <strong>Detected Symptoms:</strong> ${foundSymptoms.map((s) => `<span class="chip">${s}</span>`).join(' ')}<br><br>
  <div class="chat-risk-box" style="background:${rc.bg};border-left:4px solid ${rc.color}">
    <div style="font-size:18px;font-weight:700;color:${rc.color}">${rc.icon} Risk Level: ${rc.label}</div>
    <div style="margin-top:6px;font-size:13px">${rc.action}</div>
  </div>
  <br><strong>Possible Conditions</strong> <em>(based on symptoms)</em>:<br>
  ${uniqueConditions.map((c) => `<div class="chat-condition-item">• ${c}</div>`).join('')}
  <br>
  <div class="chat-warning-box">
    ⚠️ This is a <strong>general assessment only</strong> and NOT a medical diagnosis. Always consult a licensed healthcare professional for accurate diagnosis and treatment.
  </div>
  ${overallRisk === 'high' ? `<br>${SOS_CALLOUT}` : ''}
  ${DISCLAIMER}`
}

function buildMentalHealthResourcesResponse() {
  return `💙 <strong>Mental Health & Emotional Support Resources</strong><br><br>
  <div class="chat-emotion-bubble">
    You're not alone — reaching out is always the right move. Here are some ways to get support:
  </div><br>
  <strong>📍 On-Campus Support:</strong>
  <div class="chat-info-box">
    <div class="info-row"><span>🏥 Clinic / Guidance Office</span><span>Visit the clinic or call ${PHONE_LINK}</span></div>
    <div class="info-row"><span>🕐 Hours</span><span>Mon–Fri, 8:00 AM–5:00 PM</span></div>
    <div class="info-row"><span>🚨 After Hours</span><span>Go to the nearest hospital, or call a national hotline below</span></div>
  </div>
  <strong>📞 National Hotlines (Philippines):</strong>
  <div class="chat-info-box">
    <div class="info-row"><span>🆘 NCMH Crisis Line</span><span><strong>1553</strong> (24/7, Free)</span></div>
    <div class="info-row"><span>💙 Hopeline PH</span><span><strong>02-8804-4673</strong> (24/7)</span></div>
    <div class="info-row"><span>🤝 In Touch Crisis</span><span><strong>02-8893-7603</strong></span></div>
    <div class="info-row"><span>🚑 Emergency</span><span><strong>911</strong></span></div>
  </div>
  <strong>🌿 Healthy Coping Strategies:</strong>
  ${MENTAL_HEALTH_FOLLOW_UPS.join('')}
  <div class="chat-emotion-support-note">⚠️ <em>If you or someone you know is in immediate danger, please call <strong>911</strong> or go to the nearest emergency room immediately.</em></div>`
}

function buildCopingTipsResponse() {
  return `🌿 <strong>Coping Strategies That Can Help</strong><br><br>
  <div class="chat-emotion-bubble">
    These won't fix everything overnight, but small steps can make a real difference over time. Be patient and kind with yourself. 💙
  </div><br>
  ${MENTAL_HEALTH_FOLLOW_UPS.join('')}
  <div class="chat-tip-item">🛌 <strong>Rest without guilt</strong> — your body and mind need recovery time, not just productivity.</div>
  <div class="chat-tip-item">🎨 <strong>Do something creative</strong> — draw, cook, listen to music, or anything that lets you express yourself.</div>
  <div class="chat-tip-item">🤗 <strong>Reach out to one person</strong> you trust — even just a text saying "hey, I'm not doing great" can open a door.</div>
  <br>
  <div class="chat-chips">
    ${chip('📋 Resources', 'mental health resources')}
    ${chip('💬 Talk to Someone', 'I want to talk to someone')}
  </div>`
}

function buildTalkToSomeoneResponse() {
  return `💬 <strong>You Don't Have to Go Through This Alone</strong><br><br>
  <div class="chat-emotion-bubble">
    Reaching out takes courage, and you're already doing it. 💙 Here's who you can talk to:
  </div><br>
  <strong>👤 People You Can Reach Out To:</strong>
  <div class="chat-tip-item">🤝 A trusted friend or family member — sometimes just saying it out loud helps</div>
  <div class="chat-tip-item">🏫 A teacher, mentor, or adviser you feel comfortable with</div>
  <div class="chat-tip-item">🏥 Our clinic counselor — no appointment needed, walk-ins welcome</div>
  <div class="chat-tip-item">📞 A crisis hotline if things feel urgent (NCMH: <strong>1553</strong>, 24/7)</div>
  <br>
  <strong>💡 How to Start the Conversation:</strong>
  <div class="chat-tip-item">You can simply say: <em>"I haven't been doing well lately and I needed to tell someone."</em></div>
  <div class="chat-tip-item">You don't need to have the perfect words — just starting is enough.</div>
  <div class="chat-chips" style="margin-top:10px">
    ${chip('📋 More Resources', 'mental health resources')}
    ${chip('🌿 Coping Tips', 'coping tips')}
  </div>`
}

function getEmotionalResponse(intent) {
  const responses = MENTAL_HEALTH_RESPONSES[intent]
  if (!responses) return null
  const reply = responses[Math.floor(Math.random() * responses.length)]

  if (intent === 'emotion_suicidal') {
    return `<div class="chat-emotion-bubble">${reply}</div>`
  }

  const tip = MENTAL_HEALTH_FOLLOW_UPS[Math.floor(Math.random() * MENTAL_HEALTH_FOLLOW_UPS.length)]
  const clinicNote = `<div class="chat-emotion-support-note">
    💙 If these feelings persist or feel too heavy to handle, please don't hesitate to <strong>visit our clinic</strong> or speak with a trusted person. You deserve real support.
    <div class="chat-chips" style="margin-top:8px">
      ${chip('🌿 Coping Tips', 'I need help coping')}
      ${chip('💬 Talk to Someone', 'I want to talk to someone')}
      ${chip('📋 Resources', 'mental health resources')}
    </div>
  </div>`

  return `<div class="chat-emotion-bubble">${reply}</div><br>${tip}<br>${clinicNote}`
}

function buildBotResponse(intent, msg, ctx) {
  const lower = msg.toLowerCase()

  switch (intent) {
    case 'greeting': {
      const hour = new Date().getHours()
      const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
      return `${greet}, <strong>${ctx.firstName || 'there'}!</strong> 👋 I'm <strong>MediBot</strong>, your 24/7 clinic assistant.<br><br>I can help you with:<br>
      <div class="chat-chips">
        ${chip('🕐 Clinic Hours', 'clinic hours')}
        ${chip('🩺 Symptom Check', 'symptoms')}
        ${chip('📄 Documents', 'documents')}
        ${chip('💚 Health Tips', 'health tips')}
        ${chip('🏥 Services', 'services')}
        ${chip('🚨 Emergency', 'emergency')}
      </div>
      What can I help you with today?`
    }

    case 'farewell':
      return `👋 Take care and stay healthy! Remember, the clinic is always here for you during operating hours.<br><br>🕐 Mon–Fri: <strong>8:00 AM – 5:00 PM</strong><br>📞 Clinic: ${PHONE_LINK}`

    case 'thanks':
      return `😊 You're welcome! Is there anything else I can help you with? Don't hesitate to ask about clinic services, health tips, or document requests.`

    case 'hours': {
      const now = new Date()
      const day = now.getDay()
      const hour = now.getHours() + now.getMinutes() / 60
      const isOpen = day >= 1 && day <= 5 && hour >= 8 && hour < 17
      const status = isOpen
        ? '<span style="color:#16A34A;font-weight:600">🟢 Currently OPEN</span>'
        : '<span style="color:#DC2626;font-weight:600">🔴 Currently CLOSED</span>'
      return `🕐 <strong>Clinic Schedule</strong><br><br>
      <div class="chat-info-box">
        <div class="info-row"><span>📅 Monday – Friday</span><span><strong>8:00 AM – 5:00 PM</strong></span></div>
        <div class="info-row"><span>📅 Saturday & Sunday</span><span><strong>Closed</strong></span></div>
      </div>
      Status right now: ${status}<br><br>
      Walk-ins are welcome during clinic hours. For appointments or after-hours concerns, call ${PHONE_LINK}.`
    }

    case 'location':
      return `📍 <strong>Clinic Location</strong><br><br>
      <div class="chat-info-box">
        <div class="info-row"><span>📍 Campus</span><span><strong>Bulsu Meneses Campus (Near Gate 1)</strong></span></div>
        <div class="info-row"><span>🏢 Building</span><span><strong>Main Building</strong></span></div>
        <div class="info-row"><span>🪜 Floor</span><span><strong>Ground Floor</strong></span></div>
        <div class="info-row"><span>📞 Phone</span><span>${PHONE_LINK}</span></div>
        <div class="info-row"><span>📧 Email</span><span><strong>infirmary.meneses@bulsu.edu.ph</strong></span></div>
        <div class="info-row"><span>📘 Facebook</span><span><strong>Bulsu Health Services Unit-Meneses Campus</strong></span></div>
      </div>
      💡 <em>Tip: Look for the green clinic cross sign at the main building entrance.</em>`

    case 'staff':
      return `👩‍⚕️ <strong>Clinic Staff</strong><br><br>
      ${KB.clinic.staff.map((s) => `<div class="chat-info-box" style="margin-bottom:8px">
        <div class="info-row"><span>🏷️ Role</span><span><strong>${s.role}</strong></span></div>
        <div class="info-row"><span>🕐 Schedule</span><span>${s.available}</span></div>
      </div>`).join('')}
      <em>Staff schedules may change. Check the clinic bulletin board for updates.</em>`

    case 'services':
      return `🏥 <strong>Available Clinic Services</strong><br><br>
      ${KB.services.map((s) => `<div class="chat-service-item">
        <span class="service-icon">${s.icon}</span>
        <div><strong>${s.name}</strong><br><span style="color:var(--text-2);font-size:12px">${s.desc}</span></div>
      </div>`).join('')}`

    case 'documents':
      return `📄 <strong>Document Request Guide</strong><br><br>
      <strong>Available Document Types:</strong>
      <ul>${KB.documents.types.map((d) => `<li>${d}</li>`).join('')}</ul>
      <strong>📝 How to Request:</strong><br>
      ${KB.documents.steps.map((s, i) => `<div class="chat-step"><span class="step-num">${i + 1}</span><span>${s}</span></div>`).join('')}
      <br>🔍 Need to know requirements for a specific document? Ask me: <em>"What are the requirements for [document name]?"</em>`

    case 'doc_requirements': {
      const docType =
        KB.documents.types.find((d) => lower.includes(d.toLowerCase())) ||
        (lower.includes('medical') ? 'Medical Certificate' : lower.includes('clearance') ? 'Health Clearance' : lower.includes('fit') ? 'Fit to Work Certificate' : lower.includes('physical') ? 'Physical Exam Form' : null)
      if (docType && KB.documents.requirements[docType]) {
        const reqs = KB.documents.requirements[docType]
        return `📋 <strong>Requirements for ${docType}</strong><br><br>
        ${reqs.map((r) => `<div class="chat-step"><span class="step-num">✓</span><span>${r}</span></div>`).join('')}
        <br>📌 Once you have all requirements ready, go to <strong>My Requests → New Request</strong> to submit your application.<br><br>Processing time: <strong>1–3 business days</strong>.`
      }
      return `📋 <strong>Document Requirements Overview</strong><br><br>
      For all document requests, you will generally need:<br>
      <div class="chat-step"><span class="step-num">✓</span><span>Valid school/employee ID</span></div>
      <div class="chat-step"><span class="step-num">✓</span><span>Completed request form (available at the clinic)</span></div>
      <div class="chat-step"><span class="step-num">✓</span><span>Purpose/reason for the document</span></div>
      <br>Ask about a specific document:<br>
      <div class="chat-chips">
        ${KB.documents.types.map((d) => chip(d, `requirements for ${d}`)).join('')}
      </div>`
    }

  

    case 'pre_clinic':
      if (lower.includes('lab')) {
        return `🔬 <strong>Before a Lab Test</strong><br><br>
        ${KB.preClinit.labTest.map((t) => `<div class="chat-tip-item">• ${t}</div>`).join('')}
        <br>💡 If unsure, ask the clinic staff what specific preparations are needed for your test.`
      }
      if (lower.includes('physical')) {
        return `📋 <strong>Before a Physical Exam</strong><br><br>
        ${KB.preClinit.physical.map((t) => `<div class="chat-tip-item">• ${t}</div>`).join('')}
        <br>💡 Bring any previous health records or lab results for a more complete assessment.`
      }
      return `🏥 <strong>Before Your Clinic Visit</strong><br><br>
      <strong>General Preparation:</strong><br>
      ${KB.preClinit.general.map((tip) => `<div class="chat-step"><span class="step-num">→</span><span>${tip}</span></div>`).join('')}
      <br>For specific visit types, ask me:<br>
      <div class="chat-chips">
        ${chip('🔬 Lab Test', 'prepare for lab test')}
        ${chip('📋 Physical Exam', 'prepare for physical exam')}
      </div>`

  
    case 'emergency':
      return `🚨 <strong>EMERGENCY GUIDANCE</strong><br><br>
      <div class="chat-emergency-box">
        ${KB.emergency.steps.map((s) => `<div class="emergency-step">${s}</div>`).join('')}
      </div>
      <br><strong>📞 Emergency Contacts:</strong><br>
      <div class="chat-info-box">
        ${KB.emergency.contacts.map((c) => `<div class="info-row"><span>${c.label}</span><span><strong>${c.value}</strong></span></div>`).join('')}
      </div>
      <br>${SOS_CALLOUT}
      <br>${KB.emergency.disclaimer}`

    case 'headache':
      return buildHealthTipResponse('headache', KB.healthTips.headache) + DISCLAIMER
    case 'fever':
      return buildHealthTipResponse('fever', KB.healthTips.fever) + DISCLAIMER
    case 'colds':
      return buildHealthTipResponse('colds', KB.healthTips.colds) + DISCLAIMER
    case 'cough':
      return buildHealthTipResponse('cough', KB.healthTips.cough) + DISCLAIMER
    case 'stomach':
      return buildHealthTipResponse('stomach pain', KB.healthTips.stomach) + DISCLAIMER

    case 'stress':
      return (
        `<div class="chat-emotion-bubble">💙 It sounds like you might be dealing with some stress or emotional heaviness. That's real, and it matters. You don't have to push through it alone.</div><br>` +
        buildHealthTipResponse('stress & anxiety', KB.healthTips.stress) +
        `<br><div class="chat-emotion-support-note">
          💙 If this feels like more than just stress — if you're feeling overwhelmed, hopeless, or just not yourself — please know our clinic is here for you, and so is this chatbot.
          <div class="chat-chips" style="margin-top:8px">
            ${chip('😟 I feel anxious', 'I feel anxious')}
            ${chip('😮\u200d💨 I feel overwhelmed', 'I feel overwhelmed')}
            ${chip('💙 Mental Health Resources', 'mental health resources')}
          </div>
        </div>` +
        DISCLAIMER
      )

    case 'health_tips':
      return `💚 <strong>Preventive Health Tips</strong><br><br>
      ${KB.healthTips.general.map((tip) => `<div class="chat-tip-item">${tip}</div>`).join('')}
      <br>Ask about specific symptoms:<br>
      <div class="chat-chips">
        ${chip('🤕 Headache', 'headache tips')}
        ${chip('🤒 Fever', 'fever tips')}
        ${chip('🤧 Colds', 'colds tips')}
        ${chip('😮\u200d💨 Cough', 'cough tips')}
        ${chip('😓 Stress', 'stress tips')}
      </div>
      ${DISCLAIMER}`

    case 'symptoms':
    case 'symptom_check':
      ctx.setAwaitingSymptoms(true)
      return `🩺 <strong>Symptom Checker</strong><br><br>
      Please describe your symptoms and I'll help assess them. You can type them naturally, for example:<br>
      <em>"I have fever, headache, and body pain"</em><br><br>
      <strong>Common symptoms you can check:</strong><br>
      <div class="chat-chips">
        ${chip('🤒 Fever + Headache', 'I have fever and headache')}
        ${chip('🤧 Cough + Colds', 'I have cough and colds')}
        ${chip('🤢 Stomach Issues', 'I have stomach pain and vomiting')}
        ${chip('😵 Dizziness + Fatigue', 'I feel dizzy and tired')}
      </div>
      ${DISCLAIMER}`

    case 'predict':
      return runSymptomAnalysis(msg)

    case 'health_summary':
      return buildHealthSummary([...(ctx.pastMessages || []), ...(ctx.currentMessages || [])])

    case 'dental':
      return `🦷 <strong>Dental Services</strong><br><br>
      For the latest dental service posts, schedules, and updates, please visit our official Facebook page:<br><br>
      <div class="chat-info-box">
        <div class="info-row"><span>📘 Facebook Page</span><span><strong>Bulsu Health Services Unit-Meneses Campus</strong></span></div>
      </div>
      💡 Announcements about dental availability are posted there regularly.`

    case 'vaccine':
      return `💉 <strong>Vaccination Services</strong><br><br>
      Vaccines are available at the clinic based on the scheduled immunization program.<br><br>
      <div class="chat-info-box">
        <div class="info-row"><span>📋 Schedule</span><span>Check clinic bulletin board for dates</span></div>
        <div class="info-row"><span>🪪 Requirement</span><span>Valid ID and vaccination record</span></div>
        <div class="info-row"><span>📞 Inquire</span><span>Call ${PHONE_LINK} for next vaccine schedule</span></div>
      </div>
      💡 Bring your previous vaccination card to update your immunization records.`

    case 'my_requests': {
      const reqs = ctx.docRequests || []
      if (!reqs.length) return `📄 You don't have any document requests yet.<br><br>To submit a request, go to <strong>My Requests → New Request</strong>.`
      const pending = reqs.filter((r) => r.status === 'Pending').length
      const approved = reqs.filter((r) => r.status === 'Approved').length
      const processing = reqs.filter((r) => r.status === 'Processing').length
      return `📄 <strong>Your Document Requests</strong><br><br>
      <div class="chat-info-box">
        <div class="info-row"><span>⏳ Pending</span><span><strong style="color:#D97706">${pending}</strong></span></div>
        <div class="info-row"><span>⚙️ Processing</span><span><strong style="color:#1E7B5E">${processing}</strong></span></div>
        <div class="info-row"><span>✅ Approved</span><span><strong style="color:#16A34A">${approved}</strong></span></div>
        <div class="info-row"><span>📋 Total</span><span><strong>${reqs.length}</strong></span></div>
      </div>
      Click <strong>My Requests</strong> in the sidebar to view details and track your requests.`
    }

    case 'doc_processing_day':
      return `⏱️ <strong>Document Request Processing Time</strong><br><br>
      <div class="chat-info-box">
        <div class="info-row"><span>📝 Standard Documents</span><span><strong>2–3 working days</strong></span></div>
        <div class="info-row"><span>📄 Processing includes:</span><span>Review, verification, preparation, and quality check</span></div>
      </div>
      <br><strong>Timeline Breakdown:</strong><br>
      <div class="chat-step"><span class="step-num">📅</span><span><strong>Day 1:</strong> Document request received and logged into the system</span></div>
      <div class="chat-step"><span class="step-num">📅</span><span><strong>Day 2:</strong> Staff processes and prepares your document</span></div>
      <div class="chat-step"><span class="step-num">📅</span><span><strong>Day 3:</strong> Quality check completed, ready for pickup</span></div>
      <br>💡 <strong>Tips:</strong>
      <ul>
        <li>Processing time is calculated from <strong>business days</strong> (Mon–Fri only)</li>
        <li>Weekend submissions are processed starting the next Monday</li>
        <li>You will be <strong>notified</strong> when your document is ready</li>
        <li>Check your <strong>My Requests</strong> tab or notifications for updates</li>
        <li>Pickup is available at the clinic window during <strong>8:00 AM – 5:00 PM</strong> (Mon–Fri)</li>
      </ul>
      🚀 <strong>Fast-track tip:</strong> Submit your request early in the week to get it ready faster!`

    default:
      return null
  }
}

/**
 * Main entry point. `ctx` = { firstName, docRequests, awaitingSymptoms,
 * setAwaitingSymptoms, pastMessages, currentMessages } — replaces the
 * legacy globals (DB.getSession(), _chatContext.awaitingSymptoms) with
 * values the React component owns.
 */
export function getBotReply(msg, ctx) {
  const lower = msg.toLowerCase().trim()

  // Computed once up front so it can be prepended to whichever reply
  // path below ends up firing, without duplicating this check in each
  // branch. Deliberately skipped while mid-symptom-check (awaitingSymptoms)
  // — runSymptomAnalysis already asks clarifying questions in that flow;
  // a callback there would be a non sequitur.
  const callback = !ctx.awaitingSymptoms ? checkPastMentions(msg, ctx.pastMessages) : null
  const withCallback = (reply) => (callback ? callback + reply : reply)

  if (ctx.awaitingSymptoms) {
    ctx.setAwaitingSymptoms(false)
    return runSymptomAnalysis(msg)
  }

  if (lower.includes('mental health resources') || lower.includes('mental health support')) {
    return withCallback(buildMentalHealthResourcesResponse())
  }
  if (lower.includes('i need help coping') || lower.includes('coping tips') || lower.includes('how to cope')) {
    return withCallback(buildCopingTipsResponse())
  }
  if (lower.includes('i want to talk to someone') || lower.includes('who can i talk to') || lower.includes('talk to someone')) {
    return withCallback(buildTalkToSomeoneResponse())
  }

  const intent = classifyIntent(msg)

  if (intent && MENTAL_HEALTH_INTENTS.has(intent)) {
    return withCallback(getEmotionalResponse(intent))
  }

  const emotionKeywords = ["i feel like", "i feel so", "i dont feel", 'sobrang', 'grabe na', "i can't take it", 'i cant take it', 'no one understands', 'nobody understands', 'di na ako', 'ayoko na', 'suko na', 'give up on life']
  if (emotionKeywords.some((k) => lower.includes(k)) && !intent) {
    return withCallback(getEmotionalResponse('emotion_low'))
  }

  const symptomKeywords = ['fever', 'headache', 'cough', 'vomiting', 'diarrhea', 'chest pain', 'stomach', 'dizziness', 'rash', 'i feel', 'i have', 'masakit', 'lagnat', 'ubo', 'sipon']
  if (symptomKeywords.some((k) => lower.includes(k)) && !intent) {
    return withCallback(runSymptomAnalysis(msg))
  }

  const response = buildBotResponse(intent, msg, ctx)
  if (response) return withCallback(response)

  return `🤔 I'm not sure I understood that. Here are some things I can help with:<br><br>
  <div class="chat-chips">
    ${chip('🕐 Hours', 'clinic hours')}
    ${chip('🏥 Services', 'services')}
    ${chip('📄 Documents', 'documents')}
    ${chip('🩺 Symptoms', 'symptom check')}
    ${chip('💚 Health Tips', 'health tips')}
    ${chip('🚨 Emergency', 'emergency')}
    ${chip('💙 Mental Health', 'mental health resources')}
  </div>
  <br>Or you can visit the clinic at <strong>Bulsu Meneses Campus (Near Gate 1), Ground Floor, Main Building</strong> during office hours (Mon–Fri, 8:00 AM–5:00 PM).`
}

export function buildTopicChips(topics) {
  return topics.map((t) => topicChip(t.icon, t.label, t.q)).join('')
}