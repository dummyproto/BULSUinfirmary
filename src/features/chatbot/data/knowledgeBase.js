export const KB = {
  clinic: {
    hours: { weekday: '7:30 AM – 5:30 PM', weekend: 'Closed', emergency: '24/7 via Security ext. 0000' },
    location: 'Main Building, Ground Floor, Room 101',
    phone: 'Ext. 1234',
    email: 'clinic@capstone.edu',
    staff: [
      { name: 'Dr. Jose Cruz', role: 'Physician', available: 'Mon–Fri, 8AM–5PM' },
      { name: 'Maria Reyes, RN', role: 'Registered Nurse', available: 'Mon–Fri, 7:30AM–5:30PM' },
    ],
  },
  services: [
    { name: 'General Consultation', icon: '🩺', desc: 'Free for enrolled students and employees. Walk-in.' },
    { name: 'Annual Physical Exam', icon: '📋', desc: 'Required annually. Schedule at least 2 days in advance.' },
    { name: 'First Aid', icon: '🩹', desc: 'Immediate treatment for minor injuries and emergencies.' },
    { name: 'Dental Services', icon: '🦷', desc: 'Available Wed & Fri, 9AM–3PM. Basic dental care only.' },
    { name: 'Laboratory Services', icon: '🔬', desc: 'Urinalysis, CBC, and basic lab tests by referral.' },
    { name: 'Medical Certificates', icon: '📄', desc: 'Issued after consultation. Processing takes 1–3 business days.' },
    { name: 'Health Clearance', icon: '✅', desc: 'Required for OJT, scholarships, and organizations. Bring valid ID.' },
    { name: 'Vaccination', icon: '💉', desc: 'Available based on schedule. Check clinic bulletin board.' },
  ],
  documents: {
    types: ['Medical Certificate', 'Health Clearance', 'Fit to Work Certificate', 'Physical Exam Form'],
    steps: [
      'Log in to the system and go to <strong>My Requests</strong>',
      'Click <strong>New Request</strong> and select your document type',
      'Fill in the purpose and preferred date needed',
      'Submit — the clinic will process within 1–3 business days',
      'You will be notified when your document is ready for pickup',
    ],
    requirements: {
      'Medical Certificate': ['Valid school/employee ID', 'Recent consultation record (if applicable)', 'Filled-out request form'],
      'Health Clearance': ['Valid ID', 'Updated vaccination record', 'Completed physical exam form'],
      'Fit to Work Certificate': ['Valid ID', 'Description of job/duties', 'Physician clearance may be required'],
      'Physical Exam Form': ['Valid ID', 'Completed patient information form', 'Previous health records (optional)'],
    },
  },
  preClinit: {
    general: [
      '🕐 Arrive 10–15 minutes early to complete registration',
      '🪪 Bring your valid school/employee ID',
      '📋 Prepare a list of your current medications if any',
      '😷 Wear a face mask if you have respiratory symptoms',
      '💧 Stay hydrated — avoid fasting unless instructed',
      '📝 Note down your symptoms, their duration, and severity',
    ],
    labTest: ['Fast for 8–12 hours before blood tests', 'Drink water normally (water is allowed)', 'Avoid strenuous exercise 24 hours before'],
    physical: ['Wear comfortable, easy-to-remove clothing', 'Avoid heavy meals 2 hours before', 'Bring previous health records if available'],
  },
  healthTips: {
    headache: {
      tips: ['Rest in a quiet, dark room for 20–30 minutes', 'Stay well-hydrated — drink at least 8 glasses of water daily', 'Apply a cold or warm compress to your forehead', 'Avoid screens and bright lights temporarily', 'Over-the-counter pain relievers (e.g., Ibuprofen 200mg) may help — follow dosage instructions'],
      when_to_visit: 'Visit the clinic if: headache is severe, sudden, or accompanied by fever, stiff neck, or vision changes.',
    },
    fever: {
      tips: ['Rest and avoid strenuous activity', 'Drink plenty of fluids (water, soups, ORS)', 'Take Paracetamol 500mg every 4–6 hours as needed (do not exceed 4g/day)', 'Wear light, breathable clothing', 'Use a damp cloth on forehead to cool down'],
      when_to_visit: 'Visit the clinic if: fever exceeds 39°C, lasts more than 3 days, or is accompanied by difficulty breathing or rash.',
    },
    colds: {
      tips: ['Get plenty of rest (7–9 hours of sleep)', 'Drink warm fluids — hot tea with honey, soups', 'Use saline nasal drops to relieve congestion', 'Wash hands frequently to prevent spreading', 'Avoid sharing utensils or close contact with others'],
      when_to_visit: 'Visit the clinic if: symptoms worsen after 7 days or you develop chest pain or high fever.',
    },
    cough: {
      tips: ['Drink warm water or herbal tea with honey', 'Avoid cold drinks, ice cream, and dusty environments', 'Keep head elevated while sleeping', 'Gargle with warm salt water 2–3 times daily', 'Avoid smoke and strong odors'],
      when_to_visit: 'Visit the clinic if: cough lasts more than 2 weeks, produces blood, or is accompanied by difficulty breathing.',
    },
    stomach: {
      tips: ['Avoid solid foods temporarily — start with clear liquids', 'Sip water or oral rehydration solution (ORS) slowly', 'Eat bland foods once you can tolerate them (rice, crackers, bananas)', 'Avoid dairy, fatty, or spicy foods', 'Rest and avoid strenuous activity'],
      when_to_visit: 'Visit the clinic if: pain is severe, persistent vomiting/diarrhea for more than 2 days, or signs of dehydration.',
    },
    stress: {
      tips: ['Take short breaks every 45–60 minutes during study/work', 'Practice deep breathing: inhale 4s, hold 4s, exhale 4s', 'Get 7–9 hours of quality sleep', 'Engage in light physical activity (15–30 min walk)', 'Talk to a trusted friend, family member, or counselor'],
      when_to_visit: 'Visit the clinic if: you experience prolonged anxiety, panic attacks, or inability to function normally.',
    },
    general: [
      '💧 Drink at least 8 glasses of water daily',
      '🥗 Eat balanced meals with fruits, vegetables, and protein',
      '🏃 Do at least 30 minutes of physical activity daily',
      '😴 Get 7–9 hours of quality sleep each night',
      '🤲 Wash hands for at least 20 seconds with soap',
      '😷 Wear a mask in crowded or enclosed spaces',
      '🚭 Avoid smoking and excessive alcohol consumption',
      '☀️ Get regular health check-ups and screenings',
    ],
  },
    emergency: {
    steps: [
      '🚨 <strong>Call for help immediately</strong> — shout for nearest person or call the campus clinic at <a href="tel:+639076842769" style="color:inherit;text-decoration:underline">0907-684-2769</a>',
      '🏥 <strong>Go to the clinic</strong> — Bulsu Meneses Campus (Near Gate 1) (during clinic hours)',
      '🚑 <strong>For life-threatening emergencies</strong> — Call 911 or the nearest hospital',
      '🧍 <strong>Do not move</strong> an injured person unless in immediate danger',
      '💊 <strong>Do not give medicines</strong> without medical guidance in emergencies',
    ],
    // `type` tells botEngine.js's emergency case which link scheme to
    // render each contact as (tel:/mailto:) — see contactsHtml there.
    // This array didn't exist before, even though botEngine.js was
    // always written to read KB.emergency.contacts and render an
    // "Emergency Contacts" card from it — so that card silently never
    // appeared in any emergency reply.
    contacts: [
      { label: 'Campus Clinic', value: '0907-684-2769', type: 'phone' },
      { label: 'Clinic Email', value: 'infirmary.meneses@bulsu.edu.ph', type: 'email' },
      { label: 'National Emergency', value: '911', type: 'phone' },
    ],
    disclaimer: '⚠️ <em>This information is for general guidance only and is not a substitute for professional medical advice. In life-threatening situations, always call 911 immediately.</em>',
  },
}

export const INTENTS = [
  { id: 'greeting', patterns: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'kamusta', 'musta', 'sup', 'helo'] },
  { id: 'farewell', patterns: ['bye', 'goodbye', 'see you', 'take care', 'salamat na', 'ingat'] },
  { id: 'thanks', patterns: ['thank', 'thanks', 'salamat', 'maraming salamat', 'ty', 'thank you'] },
  { id: 'hours', patterns: ['hours', 'open', 'close', 'schedule', 'bukas', 'sarado', 'time', 'anong oras', 'what time', 'when open', 'clinic open'] },
  { id: 'location', patterns: ['location', 'where', 'find', 'address', 'building', 'room', 'nasa saan', 'saan'] },
  { id: 'staff', patterns: ['doctor', 'physician', 'nurse', 'staff', 'personnel', 'sino', 'who', 'attendant', 'doctor available'] },
  { id: 'services', patterns: ['services', 'available', 'offer', 'what can', 'facilities', 'what do you have', 'ano ang'] },
  { id: 'documents', patterns: ['document', 'certificate', 'clearance', 'form', 'request', 'medical cert', 'fit to work', 'physical exam', 'how to get', 'apply'] },
  { id: 'doc_requirements', patterns: ['requirements', 'need to bring', 'what to bring', 'requirement', 'needed', 'paano', 'how', 'steps'] },
  { id: 'pre_clinic', patterns: ['prepare', 'preparation', 'before visit', 'what to do before', 'before going', 'before clinic', 'pre-clinic', 'pre clinic'] },
  { id: 'my_requests', patterns: ['my request', 'status', 'pending', 'approved', 'my documents', 'check request', 'request status'] },
  { id: 'doc_processing_day', patterns: ['processing day', 'how many days', 'processing time', 'document processing', 'how long', 'days to process', 'waiting time', 'timeline'] },
  { id: 'emergency', patterns: ['emergency', 'urgent', 'help', 'accident', 'unconscious', 'faint', 'bleeding', 'overdose', '911', 'ambulance', 'critical'] },
  { id: 'symptoms', patterns: ['symptom', 'feeling', 'i feel', 'i have', 'i am feeling', 'masakit', 'may sakit', 'nag', 'experiencing', 'suffering'] },
  { id: 'headache', patterns: ['headache', 'head pain', 'migraine', 'sakit ng ulo', 'masakit ang ulo'] },
  { id: 'fever', patterns: ['fever', 'high temperature', 'lagnat', 'mainit', 'hot', '38', '39', '40'] },
  { id: 'colds', patterns: ['colds', 'cold', 'sipon', 'runny nose', 'stuffy', 'congestion', 'sore throat', 'ngipin'] },
  { id: 'cough', patterns: ['cough', 'ubo', 'coughing', 'dry cough', 'wet cough'] },
  { id: 'stomach', patterns: ['stomach', 'stomachache', 'diarrhea', 'vomit', 'nausea', 'sakit ng tiyan', 'LBM', 'loose bowel', 'ulcer'] },
  { id: 'stress', patterns: ['stress', 'anxiety', 'mental', 'burnout', 'depressed', 'overwhelmed', 'pagod', 'tired all the time'] },
  { id: 'health_tips', patterns: ['health tip', 'advice', 'prevent', 'stay healthy', 'healthy lifestyle', 'nutrition', 'hygiene', 'exercise', 'diet', 'mag ingat'] },
  { id: 'predict', patterns: ['predict', 'risk', 'likely', 'chances', 'assessment', 'analyze', 'what do i have', 'diagnose', 'am i okay', 'serious'] },
  { id: 'symptom_check', patterns: ['check symptoms', 'symptom check', 'check my symptoms', 'what illness', 'what disease', 'could it be', 'ano ang sakit'] },
  { id: 'dental', patterns: ['dental', 'teeth', 'tooth', 'ngipin', 'ipin', 'dentist'] },
  { id: 'health_summary', patterns: ['health summary', 'my health history', 'predict my health', 'health pattern', 'analyze my symptoms', 'my symptom history', 'health prediction', 'based on my chat'] },
  { id: 'vaccine', patterns: ['vaccine', 'vaccination', 'immunization', 'bakuna', 'shot'] },
  // ── MENTAL HEALTH / EMOTIONAL SUPPORT INTENTS ──
  { id: 'emotion_sad', patterns: ['i feel sad', 'im sad', 'feeling sad', 'i am sad', 'malungkot', 'lungkot', 'sobrang lungkot', 'crying', 'i keep crying', 'i want to cry', 'i cried'] },
  { id: 'emotion_lonely', patterns: ['lonely', 'alone', 'no one cares', 'nobody cares', 'walang nagmamalasakit', 'nag-iisa', 'mag-isa lang', 'isolated', 'no friends', 'feel invisible'] },
  { id: 'emotion_worthless', patterns: ['not good enough', 'worthless', 'useless', 'i hate myself', 'failure', 'i am a failure', 'i cant do anything right', 'basura', 'wala akong kwenta', 'lagi akong mali'] },
  { id: 'emotion_anxious', patterns: ['anxious', 'nervous', 'panic', 'cant breathe', 'heart racing', 'im scared', 'im afraid', 'takot', 'natatakot', 'kaba', 'nagkakaba', 'overthinking', 'overthink'] },
  { id: 'emotion_hopeless', patterns: ['hopeless', 'no hope', 'no point', 'give up', 'i give up', 'susurender na', 'wala na', 'ayaw ko na', 'i dont want to continue', 'gusto ko na lang'] },
  { id: 'emotion_angry', patterns: ['so angry', 'i am angry', 'im angry', 'galit', 'galit na galit', 'inis', 'irritated', 'frustrated', 'i want to scream', 'i cant take it anymore'] },
  { id: 'emotion_lost', patterns: ['i feel lost', 'dont know what to do', 'confused about life', 'walang direksyon', 'di ko alam', 'i dont know anymore', 'nawawala ako'] },
  { id: 'emotion_exhausted', patterns: ['emotionally exhausted', 'mentally tired', 'i am drained', 'wala na akong lakas', 'napagod na ako', 'burnt out', 'burned out', 'lumalala', 'getting worse', 'i feel overwhelmed', 'overwhelmed', 'too much na'] },
  { id: 'emotion_suicidal', patterns: ['want to die', 'kill myself', 'end my life', 'no reason to live', 'gusto ko mamatay', 'wala na akong dahilan', 'suicidal', 'suicide', 'self harm', 'hurt myself', 'i want to disappear'] },
  { id: 'emotion_pressure', patterns: ['so much pressure', 'too much pressure', 'expectations', 'pressure', 'pinipilit', 'pinilit', 'family pressure', 'academic pressure', 'work pressure', 'di ko kaya'] },
  { id: 'emotion_grief', patterns: ['grieving', 'grief', 'lost someone', 'someone died', 'namatay', 'yumao', 'miss them so much', 'i miss them', 'death in the family', 'nawawala'] },
  { id: 'emotion_low', patterns: ['feeling low', 'feeling down', 'not okay', 'i am not okay', 'hindi okay', 'hindi na okay', 'not myself', 'di ko makita', 'dark thoughts'] },
]

export const SYMPTOM_MAP = {
  fever: { conditions: ['Flu/Influenza', 'Common Cold', 'COVID-19', 'Urinary Tract Infection', 'Dengue (if with rash/joint pain)'], risk: 'medium' },
  headache: { conditions: ['Tension Headache', 'Migraine', 'Dehydration', 'Sinusitis', 'Hypertension (if severe)'], risk: 'low' },
  cough: { conditions: ['Common Cold', 'Flu', 'Bronchitis', 'Pharyngitis', 'Asthma (if wheezing)'], risk: 'low' },
  'sore throat': { conditions: ['Pharyngitis', 'Tonsillitis', 'Common Cold', 'Strep Throat'], risk: 'low' },
  'runny nose': { conditions: ['Common Cold', 'Flu', 'Allergic Rhinitis'], risk: 'low' },
  vomiting: { conditions: ['Gastroenteritis', 'Food Poisoning', 'Viral Illness'], risk: 'medium' },
  diarrhea: { conditions: ['Gastroenteritis', 'Food Poisoning', 'Irritable Bowel Syndrome'], risk: 'medium' },
  'stomach pain': { conditions: ['Gastritis', 'Ulcer', 'Appendicitis (if lower right)', 'Gastroenteritis'], risk: 'medium' },
  'chest pain': { conditions: ['Acid Reflux/GERD', 'Muscle Strain', 'Anxiety', '⚠️ Possible Cardiac Issue — seek immediate care'], risk: 'high' },
  'difficulty breathing': { conditions: ['Asthma', 'Anxiety/Panic Attack', 'Pneumonia', '⚠️ Seek immediate medical attention'], risk: 'high' },
  dizziness: { conditions: ['Dehydration', 'Low Blood Pressure', 'Vertigo', 'Anemia'], risk: 'medium' },
  rash: { conditions: ['Allergic Reaction', 'Dengue (with fever)', 'Eczema', 'Heat Rash'], risk: 'medium' },
  fatigue: { conditions: ['Sleep Deprivation', 'Anemia', 'Flu/Viral Illness', 'Stress/Burnout'], risk: 'low' },
  'body pain': { conditions: ['Flu/Influenza', 'Muscle Strain', 'Dengue (if with fever/rash)'], risk: 'low' },
}

export const QUICK_REPLY_SETS = {
  default: ['Clinic hours', 'Services', 'Documents', 'Symptom check', 'Health tips', 'Mental health support'],
  health: ['Headache tips', 'Fever tips', 'Colds tips', 'Cough tips', 'Stress tips', 'General health tips'],
  docs: ['Requirements for Medical Certificate', 'Requirements for Health Clearance', 'How to request documents', 'My request status'],
  emergency: ['Emergency steps', 'Emergency contacts', 'What to do for fever', 'What to do for headache'],
  mental: ['I feel sad', 'I feel anxious', 'I feel lonely', 'I need help coping', 'Talk to someone', 'Mental health resources'],
}