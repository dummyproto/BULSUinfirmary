import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import Spinner from '@components/ui/Spinner'
import { ROLE_LABELS, ROLE_GRADIENTS, calcAge } from './lib/profileHelpers'
import EditProfileModal from './EditProfileModal'
import EditFamilyModal from './EditFamilyModal'
import ChangePasswordModal from './ChangePasswordModal'
import { getUserByEmail, updateUser, updatePatientProfile, updateStaffProfile } from '@services/usersService'
import {
  UserIcon,
  PeopleIcon,
  SettingsIcon,
  CameraIcon,
  EditIcon,
  CreditCardIcon,
  PhoneIcon,
  MapPinIcon,
  GraduationCapIcon,
  LockIcon,
  KeyIcon,
  ShieldIcon,
  CheckCircleIcon,
} from '@components/ui/icons'

const tabLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 }

const TABS = [{ key: 'personal', label: <span style={tabLabelStyle}><UserIcon width={14} height={14} /> Personal Information</span> }]

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value || '—'}</span>
    </div>
  )
}

// Maps the real `users` + `patient_profiles`/`staff_profiles` row (from
// usersService) into the camelCase shape the Edit modals already use.
function toFormShape(row) {
  return {
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    avatarInitials: row.avatar_initials || (row.name || '?').slice(0, 2).toUpperCase(),
    profileImg: row.profile_img_url || null,
    surname: row.surname || '',
    givenName: row.given_name || '',
    mi: row.middle_initial || '',
    ext: row.suffix || '',
    username: row.username || '',
    dateOfBirth: row.date_of_birth || '',
    birthPlace: row.birth_place || '',
    gender: row.gender || '',
    civilStatus: row.civil_status || '',
    religion: row.religion || '',
    nationality: row.nationality || 'Filipino',
    bloodType: row.blood_type || '',
    addrRegion: row.addr_region || '',
    addrProvince: row.addr_province || '',
    addrCity: row.addr_city || '',
    addrBarangay: row.addr_barangay || '',
    addrZip: row.addr_zip || '',
    course: row.course || '',
    yearLevel: row.year_level || '',
    userId: row.student_number || '',
    parentName: row.parent_name || '',
    parentRelation: row.parent_relation || '',
    parentPhone: row.parent_phone || '',
    parentPhone2: row.parent_phone2 || '',
    guardianAddress: row.guardian_address || '',
    fatherName: row.father_name || '',
    fatherPhone: row.father_phone || '',
    fatherAddress: row.father_address || '',
    motherName: row.mother_name || '',
    motherPhone: row.mother_phone || '',
    motherAddress: row.mother_address || '',
    department: row.department || '',
    position: row.position || '',
  }
}

export default function ProfilePage() {
  const { role, profile: authProfile, refreshProfile } = useAuth()
  const { show } = useToast()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  const [tab, setTab] = useState('personal')
  const [editOpen, setEditOpen] = useState(false)
  const [familyEdit, setFamilyEdit] = useState(null) // { section, initial }
  const [pwOpen, setPwOpen] = useState(false)

  useEffect(() => {
    if (!authProfile?.email) return undefined
    let cancelled = false
    getUserByEmail(authProfile.email)
      .then((row) => {
        if (!cancelled) setUser(toFormShape(row))
      })
      .catch((err) => show(`Failed to load profile: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authProfile?.email])

  const tabItems = [
    ...TABS,
    ...(role === 'patient' ? [{ key: 'family', label: <span style={tabLabelStyle}><PeopleIcon width={14} height={14} /> Family Background</span> }] : []),
    { key: 'settings', label: <span style={tabLabelStyle}><SettingsIcon width={14} height={14} /> Account Settings</span> },
  ]

  function handleAvatarClick() {
    fileInputRef.current?.click()
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) return show('Only JPG, PNG, GIF, or WEBP images are allowed', 'error')
    if (file.size > 2 * 1024 * 1024) return show('Image must be smaller than 2MB', 'error')

    const reader = new FileReader()
    reader.onload = async (ev) => {
      // NOTE: stores the image as a base64 data URL directly in
      // `users.profile_img_url` (a TEXT column) — works for a demo, but a
      // real deployment should upload to Supabase Storage and store the
      // resulting URL instead. Setting up a Storage bucket + policies is a
      // separate piece of infrastructure outside this table-CRUD service
      // layer, so it wasn't built here.
      try {
        await updateUser(authProfile.user_id, { profile_img_url: ev.target.result })
        setUser((u) => ({ ...u, profileImg: ev.target.result }))
        show('Profile photo updated!', 'success')
      } catch (err) {
        show(`Failed to save photo: ${err.message}`, 'error')
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveProfile(updates) {
    try {
      // `username` is only ever collected on the patient side of
      // EditProfileModal (staff/admin have no such field) — this was
      // previously omitted entirely from the update payload, so the UI
      // let someone type a new username, showed a success toast, and
      // silently never persisted the change.
      const userPatch = { name: updates.name, email: updates.email, phone: updates.phone }
      if (updates.username !== undefined) userPatch.username = updates.username
      await updateUser(authProfile.user_id, userPatch)
      if (role === 'patient') {
        await updatePatientProfile(authProfile.user_id, {
          surname: updates.surname || null,
          given_name: updates.givenName || null,
          middle_initial: updates.mi || null,
          suffix: updates.ext || null,
          date_of_birth: updates.dateOfBirth || null,
          birth_place: updates.birthPlace || null,
          gender: updates.gender || null,
          civil_status: updates.civilStatus || null,
          religion: updates.religion || null,
          nationality: updates.nationality || null,
          blood_type: updates.bloodType || null,
          addr_region: updates.addrRegion || null,
          addr_province: updates.addrProvince || null,
          addr_city: updates.addrCity || null,
          addr_barangay: updates.addrBarangay || null,
          addr_zip: updates.addrZip || null,
          course: updates.course || null,
          year_level: updates.yearLevel || null,
        })
      } else {
        await updateStaffProfile(authProfile.user_id, { department: updates.department || null, position: updates.position || null })
      }
      setUser((u) => ({ ...u, ...updates }))
      setEditOpen(false)
      show('Profile updated successfully!', 'success')
      refreshProfile?.()
    } catch (err) {
      // Username has a UNIQUE constraint — now that it's actually being
      // saved, a duplicate-key error is newly reachable here, same
      // friendly-message treatment as registration's duplicate handling.
      if (err.code === '23505' || /duplicate key/i.test(err.message)) {
        show(/username/i.test(err.message) ? 'That username is already taken. Please choose another.' : 'That value is already in use by another account.', 'error')
      } else {
        show(`Failed to update profile: ${err.message}`, 'error')
      }
    }
  }

  function openFamilyEdit(section) {
    const initial =
      section === 'father'
        ? { name: user.fatherName, phone: user.fatherPhone, address: user.fatherAddress }
        : section === 'mother'
          ? { name: user.motherName, phone: user.motherPhone, address: user.motherAddress }
          : { name: user.parentName, relation: user.parentRelation, phone: user.parentPhone, address: user.guardianAddress }
    setFamilyEdit({ section, initial })
  }

  async function handleSaveFamily(section, form) {
    try {
      if (section === 'father') {
        await updatePatientProfile(authProfile.user_id, { father_name: form.name || null, father_phone: form.phone || null, father_address: form.address || null })
        setUser((u) => ({ ...u, fatherName: form.name, fatherPhone: form.phone, fatherAddress: form.address }))
        show("Father's information updated", 'success')
      } else if (section === 'mother') {
        await updatePatientProfile(authProfile.user_id, { mother_name: form.name || null, mother_phone: form.phone || null, mother_address: form.address || null })
        setUser((u) => ({ ...u, motherName: form.name, motherPhone: form.phone, motherAddress: form.address }))
        show("Mother's information updated", 'success')
      } else {
        await updatePatientProfile(authProfile.user_id, {
          parent_name: form.name || null,
          parent_relation: form.relation || null,
          parent_phone: form.phone || null,
          guardian_address: form.address || null,
        })
        setUser((u) => ({ ...u, parentName: form.name, parentRelation: form.relation, parentPhone: form.phone, guardianAddress: form.address }))
        show('Guardian information updated', 'success')
      }
    } catch (err) {
      show(`Failed to update family information: ${err.message}`, 'error')
    }
    setFamilyEdit(null)
  }

  if (loading || !user) return <Spinner label="Loading profile…" />

  return (
    <>
      <div className="profile-header">
        <div
          className="profile-avatar-lg"
          role="button"
          tabIndex={0}
          aria-label="Change profile photo"
          onClick={handleAvatarClick}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleAvatarClick())}
          title="Click to change photo"
        >
          {user.profileImg ? <img src={user.profileImg} alt="Profile" /> : <span>{user.avatarInitials}</span>}
          <div className="avatar-upload-overlay"><CameraIcon width={16} height={16} /></div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
        <div className="profile-info">
          <h2>{user.name}</h2>
          <p>{user.email || 'No email set'}</p>
          <span className="role-tag" style={{ background: ROLE_GRADIENTS[role] }}>
            {ROLE_LABELS[role]}
          </span>
        </div>
      </div>

      <div className="profile-tabs-container">
        <div className="profile-tabs">
          {tabItems.map((t) => (
            <button key={t.key} type="button" className={`profile-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'personal' && (
          <div className="profile-tab-content active">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {role === 'patient' ? (
                <>
                  <div className="profile-info-row-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="card">
                      <div className="card-header" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UserIcon width={15} height={15} />
                          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Name</h3>
                        </div>
                        <button type="button" className="btn btn-sm btn-blue" onClick={() => setEditOpen(true)}>
                          <EditIcon width={13} height={13} /> Edit
                        </button>
                      </div>
                      <div style={{ padding: '14px 18px' }}>
                        <DetailRow label="Full Name" value={user.name} />
                        <DetailRow label="Surname" value={user.surname} />
                        <DetailRow label="Given Name" value={user.givenName} />
                        <DetailRow label="M.I." value={user.mi} />
                        <DetailRow label="Extension" value={user.ext} />
                        <DetailRow label="Username" value={user.username} />
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CreditCardIcon width={15} height={15} />
                          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Personal Details</h3>
                        </div>
                      </div>
                      <div style={{ padding: '14px 18px' }}>
                        <DetailRow label="Date of Birth" value={user.dateOfBirth} />
                        <DetailRow label="Age" value={calcAge(user.dateOfBirth)} />
                        <DetailRow label="Place of Birth" value={user.birthPlace} />
                        <DetailRow label="Gender" value={user.gender} />
                        <DetailRow label="Civil Status" value={user.civilStatus} />
                        <DetailRow label="Religion" value={user.religion} />
                        <DetailRow label="Nationality" value={user.nationality} />
                        <DetailRow label="Blood Type" value={user.bloodType} />
                      </div>
                    </div>
                  </div>

                  <div className="profile-info-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div className="card">
                      <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PhoneIcon width={15} height={15} />
                          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Contact</h3>
                        </div>
                      </div>
                      <div style={{ padding: '14px 18px' }}>
                        <DetailRow label="Email" value={user.email} />
                        <DetailRow label="Phone" value={user.phone} />
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <MapPinIcon width={15} height={15} />
                          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Address</h3>
                        </div>
                      </div>
                      <div style={{ padding: '14px 18px' }}>
                        <DetailRow label="Region" value={user.addrRegion} />
                        <DetailRow label="Province" value={user.addrProvince} />
                        <DetailRow label="City / Municipality" value={user.addrCity} />
                        <DetailRow label="Barangay" value={user.addrBarangay} />
                        <DetailRow label="ZIP Code" value={user.addrZip} />
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <GraduationCapIcon width={15} height={15} />
                          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Academic</h3>
                        </div>
                      </div>
                      <div style={{ padding: '14px 18px' }}>
                        <DetailRow label="User ID" value={user.userId} />
                        <DetailRow label="Course" value={user.course} />
                        <DetailRow label="Year Level" value={user.yearLevel} />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UserIcon width={15} height={15} />
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Account Information</h3>
                    </div>
                    <button type="button" className="btn btn-sm btn-blue" onClick={() => setEditOpen(true)}>
                      <EditIcon width={13} height={13} /> Edit
                    </button>
                  </div>
                  <div style={{ padding: '14px 18px' }}>
                    <DetailRow label="User ID" value={authProfile?.user_id ? `STAFF-${String(authProfile.user_id).padStart(4, '0')}` : '—'} />
                    <DetailRow label="Full Name" value={user.name} />
                    <DetailRow label="Email" value={user.email} />
                    <DetailRow label="Phone" value={user.phone} />
                    <DetailRow label="Department" value={user.department} />
                    <DetailRow label="Position" value={user.position} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'family' && role === 'patient' && (
          <div className="profile-tab-content active">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div className="card-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><UserIcon width={15} height={15} /> Father&apos;s Information</h3>
                  <button type="button" className="btn btn-sm btn-blue" onClick={() => openFamilyEdit('father')}>
                    Edit
                  </button>
                </div>
                <div style={{ padding: 16 }}>
                  <DetailRow label="Full Name" value={user.fatherName || 'Not provided'} />
                  <DetailRow label="Contact Number" value={user.fatherPhone || 'Not provided'} />
                  <DetailRow label="Address" value={user.fatherAddress || 'Not provided'} />
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><UserIcon width={15} height={15} /> Mother&apos;s Information</h3>
                  <button type="button" className="btn btn-sm btn-blue" onClick={() => openFamilyEdit('mother')}>
                    Edit
                  </button>
                </div>
                <div style={{ padding: 16 }}>
                  <DetailRow label="Full Name" value={user.motherName || 'Not provided'} />
                  <DetailRow label="Contact Number" value={user.motherPhone || 'Not provided'} />
                  <DetailRow label="Address" value={user.motherAddress || 'Not provided'} />
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PeopleIcon width={15} height={15} /> Guardian Information</h3>
                  <button type="button" className="btn btn-sm btn-blue" onClick={() => openFamilyEdit('guardian')}>
                    Edit
                  </button>
                </div>
                <div style={{ padding: 16 }}>
                  <DetailRow label="Full Name" value={user.parentName || 'Not provided'} />
                  <DetailRow label="Relationship" value={user.parentRelation || 'Not provided'} />
                  <DetailRow label="Contact Number" value={user.parentPhone || 'Not provided'} />
                  <DetailRow label="Address" value={user.guardianAddress || 'Not provided'} />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="profile-tab-content active">
            <div className="two-col-equal">
              <div className="card">
                <div className="card-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><CreditCardIcon width={15} height={15} /> Account Information</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Read-only</span>
                </div>
                <div style={{ padding: 16 }}>
                  <div className="alert" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, marginBottom: 14, padding: '8px 12px', borderRadius: 6 }}>
                    <LockIcon width={12} height={12} style={{ verticalAlign: -1, marginRight: 5 }} />These details are managed by the system and cannot be changed here.
                  </div>
                  <DetailRow label="Username" value={user.username} />
                  <DetailRow label="User / ID Number" value={role === 'patient' ? user.userId : authProfile?.user_id ? `STAFF-${String(authProfile.user_id).padStart(4, '0')}` : '—'} />
                  <DetailRow label="Email" value={user.email} />
                  <DetailRow label="Phone" value={user.phone} />
                  {role === 'patient' ? (
                    <>
                      <DetailRow label="Course" value={user.course} />
                      <DetailRow label="Year Level" value={user.yearLevel} />
                    </>
                  ) : (
                    <>
                      <DetailRow label="Department" value={user.department} />
                      <DetailRow label="Position" value={user.position} />
                    </>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}><KeyIcon width={13} height={13} /> Password</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Keep your account secure with a strong password.</div>
                    </div>
                    <button type="button" className="btn btn-blue btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setPwOpen(true)}>
                      Change Password
                    </button>
                  </div>
                </div>
              </div>

              <div className="card" style={{ alignSelf: 'start' }}>
                <div className="card-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ShieldIcon width={15} height={15} /> Account Status</h3>
                </div>
                <div style={{ padding: 14 }}>
                  <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircleIcon width={13} height={13} /> Account is active and secure</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)' }}>Role</span>
                      <strong>{ROLE_LABELS[role]}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)' }}>Session</span>
                      <strong style={{ color: 'var(--success)' }}>● Active</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <EditProfileModal
        key={editOpen ? 'open' : 'closed'}
        isOpen={editOpen}
        role={role}
        profile={user}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveProfile}
        onError={(msg) => show(msg, 'error')}
      />

      <EditFamilyModal
        key={familyEdit?.section ?? 'closed'}
        isOpen={familyEdit !== null}
        section={familyEdit?.section}
        initial={familyEdit?.initial}
        onClose={() => setFamilyEdit(null)}
        onSave={handleSaveFamily}
      />

      <ChangePasswordModal
        key={pwOpen ? 'open' : 'closed'}
        isOpen={pwOpen}
        onClose={() => setPwOpen(false)}
        onSuccess={() => show('Password updated successfully!', 'success')}
        onError={(msg) => show(msg, 'error')}
      />
    </>
  )
}
