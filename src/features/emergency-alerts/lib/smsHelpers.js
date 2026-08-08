import {
  InfoIcon,
  AlertOctagonIcon,
  TrendingUpIcon,
  EmergencyIcon,
  AlertTriangleIcon,
  ShieldIcon,
  EditIcon,
} from '@components/ui/icons'

// Every situation carries its own Tagalog translation as a separate
// field (textTl), not baked into the English text — this is what lets
// the UI show the Tagalog portion in italics distinctly from the
// English, and lets buildSMSMiddle below format them consistently
// ("English sentence." "Tagalog sentence.") instead of an inline
// parenthetical. This exists specifically for parents who don't read
// or understand English — the actual alert needs to be understandable
// to them, not just to English-reading staff.
export const SMS_TEMPLATES = [
  {
    id: 'sick',
    label: 'Sick / Feeling Unwell',
    Icon: InfoIcon,
    color: '#D97706',
    text: 'Your child is currently experiencing illness and has been referred to the school clinic for medical attention.',
    textTl: 'May sakit po ang inyong anak at dinala sa clinic ng paaralan para sa gamutan.',
  },
  {
    id: 'injured',
    label: 'Injured / Accident',
    Icon: AlertOctagonIcon,
    color: '#DC2626',
    text: 'Your child has sustained an injury and is currently being attended to by the school clinic staff.',
    textTl: 'Nasugatan po ang inyong anak at kasalukuyang inaalagaan ng staff ng clinic ng paaralan.',
  },
  {
    id: 'fever',
    label: 'High Fever',
    Icon: TrendingUpIcon,
    color: '#EA580C',
    text: 'Your child has been assessed to have a high temperature (fever) and requires rest and monitoring.',
    textTl: 'Nasuri po na may lagnat ang inyong anak at kailangan ng pahinga at pagbabantay.',
  },
  {
    id: 'emergency',
    label: 'Medical Emergency',
    Icon: EmergencyIcon,
    color: '#7F1D1D',
    text: 'Your child is experiencing a medical emergency and requires immediate attention. Please come to school immediately.',
    textTl: 'May medical emergency po ang inyong anak at kailangan ng agarang atensyon. Mangyaring pumunta po sa paaralan agad.',
  },
  {
    id: 'attention',
    label: 'Needs Attention',
    Icon: AlertTriangleIcon,
    color: '#B45309',
    text: 'Your child is not feeling well and we would like to inform you to monitor their condition.',
    textTl: 'Hindi po maganda ang pakiramdam ng inyong anak, kaya nais po naming ipaalam sa inyo upang bantayan ang kanilang kalagayan.',
  },
  {
    id: 'anxiety',
    label: 'Anxiety / Emotional',
    Icon: ShieldIcon,
    color: '#6A3FA0',
    text: 'Your child is experiencing anxiety or emotional distress. They are currently in a safe environment with our clinic staff.',
    textTl: 'Nakararanas po ang inyong anak ng pagkabalisa. Sila po ay ligtas at kasama ng aming clinic staff.',
  },
  {
    // Freeform staff-written text, not a fixed template — no reliable
    // way to auto-translate it, so this stays without a textTl field.
    id: 'custom',
    label: 'Custom Message',
    Icon: EditIcon,
    color: '#0891B2',
    text: '',
    textTl: '',
  },
]

// Pickup lines get the same bilingual treatment as the situation
// templates above. Deliberately worded to avoid repeating "Your child
// is..." (Ang inyong anak ay...) — the situation text right before this
// already opens that way, so this uses "They" / "Sila po" instead,
// rather than stacking the same subject-opener twice in one message.
const PICKUP_LINES = {
  pickup: {
    en: 'Please come to school to pick up your child as soon as possible.',
    tl: 'Mangyaring pumunta po sa paaralan para sunduin ang inyong anak sa lalong madaling panahon.',
  },
  sendhome: {
    en: 'They will be sent home early today — please make sure someone is available to receive them.',
    tl: 'Sila po ay ipapauwi nang maaga ngayong araw — pakisiguro pong may susundo sa kanila.',
  },
}

export function validatePHPhone(num) {
  const cleaned = (num || '').replace(/[\s\-().]/g, '')
  return /^(09\d{9}|\+639\d{9}|639\d{9})$/.test(cleaned)
}

export function formatPHPhone(num) {
  const cleaned = (num || '').replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('639')) return '+' + cleaned
  if (cleaned.startsWith('+639')) return cleaned
  if (cleaned.startsWith('09')) return '+63' + cleaned.slice(1)
  return cleaned
}

// No fixed header anymore — IPROG's own sender ID/account setup already
// adds one, so including it here would double it up in the delivered
// message (see the caveat flagged when this was first built, now
// confirmed).
//
// Footer is no longer a fixed disclaimer either — it identifies who
// actually sent the message (name + role), so the parent/guardian
// knows which staff member to reference if they call back.
export function buildSMSFooter(senderName, senderRole) {
  const roleLabel = senderRole ? senderRole.charAt(0).toUpperCase() + senderRole.slice(1) : 'Staff'
  return `Bulsu Meneses Infirmary - ${senderName || 'Staff'} - ${roleLabel}`
}

// Formats one bilingual sentence pair the same way everywhere in the
// message: the English sentence, then the Tagalog translation quoted
// on its own line. SMS is plain text — there's no such thing as italics
// in an actual delivered message — so quotes are what visually set the
// translation apart there; the UI (EmergencyPreviewPanel.jsx) renders
// the Tagalog portion in italics separately, on top of this.
function bilingual(en, tl) {
  return tl ? `${en}\n"${tl}"` : en
}

export function buildSMSMiddle(studentName, situation, pickupFlag, notes) {
  const pickupLine =
    pickupFlag === 'pickup'
      ? `\n\n${bilingual(PICKUP_LINES.pickup.en, PICKUP_LINES.pickup.tl)}`
      : pickupFlag === 'sendhome'
        ? `\n\n${bilingual(PICKUP_LINES.sendhome.en, PICKUP_LINES.sendhome.tl)}`
        : ''

  // "Custom Message" means exactly that — the person writes the whole
  // middle themselves, with no auto-generated intro forced in front of
  // it (every other situation works from a fixed template, so the
  // "Good day, this concerns your child..." intro makes sense there;
  // it doesn't for something meant to be fully custom).
  if (situation === 'custom') {
    return `${notes || ''}${pickupLine}`
  }

  const template = SMS_TEMPLATES.find((t) => t.id === situation)
  const situationText = template ? bilingual(template.text, template.textTl) : ''
  const notesLine = notes ? `\n\n${notes}` : ''
  const name = studentName || 'the patient'

  return `${bilingual(`Good day. This concerns your child, ${name}.`, `Magandang araw po. Ito ay tungkol sa inyong anak, ${name}.`)}\n\n${situationText}${pickupLine}${notesLine}`
}

export function buildSMSMessage(studentName, situation, pickupFlag, notes, senderName, senderRole) {
  const middle = buildSMSMiddle(studentName, situation, pickupFlag, notes)
  const footer = buildSMSFooter(senderName, senderRole)
  return `${middle}\n\n${footer}`
}