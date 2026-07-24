export const SMS_TEMPLATES = [
  { id: 'sick', label: '🤒 Sick / Feeling Unwell', icon: '🤒', color: '#D97706', text: 'Your child is currently experiencing illness and has been referred to the school clinic for medical attention.' },
  { id: 'injured', label: '🩹 Injured / Accident', icon: '🩹', color: '#DC2626', text: 'Your child has sustained an injury and is currently being attended to by the school clinic staff.' },
  { id: 'fever', label: '🌡️ High Fever', icon: '🌡️', color: '#EA580C', text: 'Your child has been assessed to have a high temperature (fever) and requires rest and monitoring.' },
  { id: 'emergency', label: '🚨 Medical Emergency', icon: '🚨', color: '#7F1D1D', text: 'Your child is experiencing a medical emergency and requires immediate attention. Please come to school immediately.' },
  { id: 'attention', label: '⚠️ Needs Attention', icon: '⚠️', color: '#B45309', text: 'Your child is not feeling well and we would like to inform you to monitor their condition.' },
  { id: 'anxiety', label: '😰 Anxiety / Emotional', icon: '😰', color: '#6A3FA0', text: 'Your child is experiencing anxiety or emotional distress. They are currently in a safe environment with our clinic staff.' },
  { id: 'custom', label: '✏️ Custom Message', icon: '✏️', color: '#0891B2', text: '' },
]

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

export function buildSMSMessage(studentName, situation, pickupFlag, notes, senderName) {
  const template = SMS_TEMPLATES.find((t) => t.id === situation)
  const situationText = template ? template.text : ''
  const pickupLine =
    pickupFlag === 'pickup'
      ? '\n\n📍 ACTION REQUIRED: Please come to school to PICK UP your child as soon as possible.'
      : pickupFlag === 'sendhome'
        ? '\n\n🏠 Your child is being sent home early. Please ensure someone is available to receive them.'
        : ''
  const notesLine = notes ? `\n\n📝 Additional Notes: ${notes}` : ''

  return `[SCHOOL CLINIC ALERT] Dear Parent/Guardian,\n\nThis is to inform you that ${studentName} has been seen at the school clinic.\n\n${situationText}${pickupLine}${notesLine}\n\nFor inquiries, please call the school clinic at Ext. 1234.\n\n— ${senderName || 'School Clinic Staff'}`
}
