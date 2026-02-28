import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

const START_HOUR = 7.5
const END_HOUR = 20
const HOUR_WIDTH = 180
const LANE_HEIGHT = 64
const BOOKING_SELECT =
  'id, boat_id, member_id, start_time, end_time, usage_status, usage_confirmed_at, usage_confirmed_by, boats(name,type), members:members!bookings_member_id_fkey(name,email)'
const CREW_TYPE_OPTIONS = [
  'Novice or Young Junior (J15 or below)',
  'Experienced Junior',
  'Experienced Senior',
  'Experienced Masters',
]
const BOAT_TYPE_OPTIONS = [
  'Large boat (8+, 4x+, 4x-, 4+, 4-)',
  'Small boat (1x, 2x, 2-)',
]
const LAUNCH_SUPERVISION_OPTIONS = [
  'Yes, each boat will always be followed by a launch',
  'Yes, though the launch cover is shared between multiple crews',
  'No, the boat will not be supervised by a launch',
]
const VISIBILITY_OPTIONS = [
  'Clear',
  'Slightly reduced (e.g low sun, increased glare, mild mist)',
  'Reduced (eg. Fog)',
]
const RIVER_LEVEL_OPTIONS = [
  'Above 6m - Crews only to boat with express permission of Club Captain',
  '5.5 - 6m - Consider if crew competency matches conditions. Younger juniors should not go out',
  'Below 5.5m',
]
const WATER_CONDITION_OPTIONS = [
  'Calm, slow flowing',
  'Choppy, slow flowing',
  'Calm, fast-flowing',
  'Choppy, fast-flowing',
]
const AIR_TEMPERATURE_OPTIONS = [
  'Above +5',
  'Between -2 and +5 - Ensure crew has adequate clothing to match conditions and stay warm',
  'Between -5 and -2 - Beginners/Younger juniors should not go out',
  'Below -5 - Boating only with the express permission of the club captain',
]
const WIND_CONDITION_OPTIONS = [
  'Calm',
  'Light/Gentle Breeze',
  'Moderate Breeze - Consider if crew competency matches conditions',
  'Fresh/Strong breeze - Beginners/younger juniors should not be out',
  'Near gale - Boating only with express permission of the club captain',
  'Light/Moderate Breeze with significant gusting',
]
const INCOMING_TIDE_OPTIONS = ['Yes', 'No']

type Member = {
  id: string
  name: string
  email: string
}

type Boat = {
  id: string
  name: string
  type: string | null
  code?: string | null
  weight?: string | null
  build_year?: string | null
  usage_type?: string | null
  in_service?: string | null
  notes?: string | null
}

type Booking = {
  id: string
  boat_id: string
  member_id: string | null
  start_time: string
  end_time: string
  usage_status?: 'scheduled' | 'pending' | 'confirmed' | 'cancelled' | null
  usage_confirmed_at?: string | null
  usage_confirmed_by?: string | null
  boats?: { name: string; type?: string | null } | { name: string; type?: string | null }[] | null
  members?: { name: string; email?: string | null } | { name: string; email?: string | null }[] | null
}

type TemplateBooking = {
  id: string
  boat_id: string | null
  member_id: string | null
  weekday: number
  start_time: string
  end_time: string
  boat_label?: string | null
  member_label?: string | null
  boats?: { name: string; type?: string | null } | { name: string; type?: string | null }[] | null
  members?: { name: string } | { name: string }[] | null
}

type TemplateException = {
  id: string
  template_id: string
  exception_date: string
}

type TemplateConfirmation = {
  id: string
  template_id: string
  member_id: string
  occurrence_date: string
  status: 'pending' | 'confirmed' | 'cancelled'
  booking_id?: string | null
  notified_at?: string | null
  responded_at?: string | null
  booking_templates?: TemplateBooking | TemplateBooking[] | null
  members?: { name: string; email?: string | null } | { name: string; email?: string | null }[] | null
}

type BoatPermission = {
  boat_id: string
  member_id: string
}

type UserRole = 'admin' | 'coordinator' | 'guest'

type BookingRiskAssessmentLink = {
  id: string
  booking_id: string
  risk_assessment_id: string
  bookings?: Booking | Booking[] | null
}

type RiskAssessment = {
  id: string
  member_id: string
  coordinator_name: string
  session_date: string
  session_time: string
  crew_type: string
  boat_type: string
  launch_supervision: string
  visibility: string
  river_level: string
  water_conditions: string
  air_temperature: string
  wind_conditions: string
  risk_actions: string
  incoming_tide: string
  created_at?: string
  members?: { name: string; email?: string | null } | { name: string; email?: string | null }[] | null
  booking_risk_assessments?: BookingRiskAssessmentLink[] | null
}

type ScheduleItem = {
  id: string
  boat_id: string | null
  member_id: string | null
  start_time: string
  end_time: string
  isTemplate: boolean
  boat_label?: string | null
  member_label?: string | null
  templateId?: string
  weekday?: number
  boats?: { name: string; type?: string | null } | { name: string; type?: string | null }[] | null
  members?: { name: string } | { name: string }[] | null
}

const getTodayString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

const formatTimeInput = (value: string) => {
  const date = new Date(value)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const toDateTime = (date: string, time: string) => new Date(`${date}T${time}:00`)
const normalizeTime = (value: string) => value.slice(0, 5)
const getWeekdayIndex = (value: string) => new Date(`${value}T12:00:00`).getDay()
const formatHourLabel = (hourValue: number) => {
  const hours = Math.floor(hourValue)
  const minutes = hourValue % 1 === 0.5 ? '30' : '00'
  return `${String(hours).padStart(2, '0')}:${minutes}`
}
const formatDayLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`)
  const day = date.getDate()
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th'
  const weekday = date.toLocaleDateString([], { weekday: 'short' })
  const month = date.toLocaleDateString([], { month: 'short' })
  return `${weekday} ${day}${suffix} of ${month}`
}
const getRelatedName = (
  value: { name: string; type?: string | null } | { name: string; type?: string | null }[] | null | undefined,
) => {
  if (!value) {
    return null
  }
  return Array.isArray(value) ? value[0]?.name ?? null : value.name
}

const getRelatedType = (
  value: { name: string; type?: string | null } | { name: string; type?: string | null }[] | null | undefined,
) => {
  if (!value) {
    return null
  }
  return Array.isArray(value) ? value[0]?.type ?? null : value.type ?? null
}

const getRoleLabel = (role: UserRole) => {
  if (role === 'admin') {
    return 'Admin'
  }
  if (role === 'coordinator') {
    return 'Coordinator'
  }
  return 'Guest'
}

const toDateInputValue = (value: string) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const canOpenRiskAssessment = (booking: Booking) => {
  const bookingStart = new Date(booking.start_time).getTime()
  if (Number.isNaN(bookingStart)) {
    return false
  }
  return Date.now() >= bookingStart - 60 * 60 * 1000
}

const getRiskAssessmentAvailabilityMessage = (booking: Booking) => {
  const bookingStart = new Date(booking.start_time)
  if (Number.isNaN(bookingStart.getTime())) {
    return 'Risk assessment is not available for this booking yet.'
  }
  const availableAt = new Date(bookingStart.getTime() - 60 * 60 * 1000)
  return `Risk assessment becomes available 1 hour before the outing starts, at ${availableAt.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}.`
}

const isPastBooking = (booking: { start_time: string }) => {
  const bookingStart = new Date(booking.start_time).getTime()
  if (Number.isNaN(bookingStart)) {
    return false
  }
  return bookingStart < Date.now()
}

const isPendingBooking = (booking: { usage_status?: Booking['usage_status'] }) =>
  booking.usage_status === 'pending'

const isSettledBooking = (booking: { usage_status?: Booking['usage_status'] }) =>
  booking.usage_status === 'confirmed' || booking.usage_status === 'cancelled'

const getBookingUsageLabel = (booking: { usage_status?: Booking['usage_status'] }) => {
  if (booking.usage_status === 'confirmed') {
    return 'Outing status: confirmed - outing happened.'
  }
  if (booking.usage_status === 'cancelled') {
    return 'Outing status: cancelled - outing did not happen.'
  }
  if (booking.usage_status === 'pending') {
    return 'Outing status: pending confirmation.'
  }
  return 'Outing status: scheduled.'
}

const getBoatTypeShortLabel = (value: string) => {
  if (value.startsWith('Large boat')) {
    return 'Large'
  }
  if (value.startsWith('Small boat')) {
    return 'Small'
  }
  return value
}

const normalizeLinkedBooking = (value: Booking | Booking[] | null | undefined) => {
  if (!value) {
    return null
  }
  return Array.isArray(value) ? value[0] ?? null : value
}

const normalizeTemplateBooking = (
  value: TemplateBooking | TemplateBooking[] | null | undefined,
) => {
  if (!value) {
    return null
  }
  return Array.isArray(value) ? value[0] ?? null : value
}

const urlBase64ToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [userRole, setUserRole] = useState<UserRole>('guest')
  const [isAdmin, setIsAdmin] = useState(false)
  const [roleFromAllowlist, setRoleFromAllowlist] = useState<UserRole | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allowedMembers, setAllowedMembers] = useState<
    { id: string; email: string; name: string; role?: UserRole | null; is_admin: boolean }[]
  >([])
  const [boats, setBoats] = useState<Boat[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([])
  const [pendingTemplateConfirmations, setPendingTemplateConfirmations] = useState<
    TemplateConfirmation[]
  >([])
  const [templateBookings, setTemplateBookings] = useState<TemplateBooking[]>([])
  const [templateExceptions, setTemplateExceptions] = useState<TemplateException[]>([])
  const [boatPermissions, setBoatPermissions] = useState<Record<string, Set<string>>>({})
  const [bookingMemberId, setBookingMemberId] = useState('')
  const [authView, setAuthView] = useState<'signin' | 'signup' | 'recovery' | 'setPassword'>(
    'signin',
  )
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedDate, setSelectedDate] = useState(getTodayString)
  const [selectedTemplateWeekday, setSelectedTemplateWeekday] = useState(
    getWeekdayIndex(getTodayString()),
  )
  const [boatTypeFilter, setBoatTypeFilter] = useState('')
  const [viewMode, setViewMode] = useState<
    | 'schedule'
    | 'templates'
    | 'boats'
    | 'access'
    | 'profile'
    | 'pendingConfirmations'
    | 'riskAssessments'
  >('schedule')

  const [showNewBooking, setShowNewBooking] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<ScheduleItem | null>(null)
  const [bookingBoatId, setBookingBoatId] = useState('')
  const [bookingBoatIds, setBookingBoatIds] = useState<string[]>([])
  const [boatSearch, setBoatSearch] = useState('')
  const [startTime, setStartTime] = useState('07:30')
  const [endTime, setEndTime] = useState('08:00')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null)
  const [riskAssessmentBooking, setRiskAssessmentBooking] = useState<Booking | null>(null)
  const [editingRiskAssessment, setEditingRiskAssessment] = useState<RiskAssessment | null>(null)
  const [linkedRiskAssessment, setLinkedRiskAssessment] = useState<RiskAssessment | null>(null)
  const [availableRiskAssessments, setAvailableRiskAssessments] = useState<RiskAssessment[]>([])
  const [riskAssessmentReadOnly, setRiskAssessmentReadOnly] = useState(false)
  const [bookingHasLinkedRiskAssessment, setBookingHasLinkedRiskAssessment] = useState(false)
  const [riskAssessments, setRiskAssessments] = useState<RiskAssessment[]>([])
  const [boatForm, setBoatForm] = useState({
    code: '',
    name: '',
    type: '',
    weight: '',
    build_year: '',
    usage_type: '',
    in_service: '',
    notes: '',
  })
  const [boatPermissionIds, setBoatPermissionIds] = useState<string[]>([])
  const [selectedPermissionMemberId, setSelectedPermissionMemberId] = useState('')
  const datePickerRef = useRef<HTMLInputElement | null>(null)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isMemberLoading, setIsMemberLoading] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushPromptDismissed, setPushPromptDismissed] = useState(false)
  const [isPendingLoading, setIsPendingLoading] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [pendingTemplateActionId, setPendingTemplateActionId] = useState<string | null>(null)
  const [selectedPendingBookingId, setSelectedPendingBookingId] = useState<string | null>(null)
  const [showAccessEditor, setShowAccessEditor] = useState(false)
  const [isRiskAssessmentLoading, setIsRiskAssessmentLoading] = useState(false)
  const [riskAssessmentForm, setRiskAssessmentForm] = useState({
    coordinator_name: '',
    session_date: '',
    session_time: '',
    crew_type: '',
    boat_type: '',
    launch_supervision: '',
    visibility: '',
    river_level: '',
    water_conditions: '',
    air_temperature: '',
    wind_conditions: '',
    risk_actions: '',
    incoming_tide: '',
  })
  const [accessForm, setAccessForm] = useState({
    email: '',
    name: '',
    role: 'guest' as UserRole,
  })

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const isCoordinator = userRole === 'coordinator'
  const isGuest = userRole === 'guest'
  const canManageAccess = isAdmin || isCoordinator
  const isSelectedDateInPast = selectedDate < getTodayString()
  const hasBlockingPendingConfirmations =
    !isAdmin && (pendingBookings.length > 0 || pendingTemplateConfirmations.length > 0)
  const shouldShowPushPrompt =
    Boolean(session && currentMember) &&
    pushSupported &&
    !pushEnabled &&
    !pushPromptDismissed &&
    Notification.permission !== 'denied' &&
    !hasBlockingPendingConfirmations
  const selectedPendingBooking = selectedPendingBookingId
    ? pendingBookings.find((booking) => booking.id === selectedPendingBookingId) ?? null
    : null

  useEffect(() => {
    if (!__BUILD_ID__) {
      return
    }

    let isActive = true

    const checkForUpdate = async () => {
      try {
        const response = await fetch('/build-meta.json', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as { buildId?: string }
        if (isActive && data.buildId && data.buildId !== __BUILD_ID__) {
          setUpdateAvailable(true)
        }
      } catch {
        // Ignore update check errors.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate()
      }
    }

    checkForUpdate()
    const interval = window.setInterval(checkForUpdate, 60000)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isActive = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    if (!status) {
      return
    }
    const timer = window.setTimeout(() => setStatus(null), 5000)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (!error || !error.includes('Failed to fetch')) {
      return
    }

    const timer = window.setTimeout(() => {
      setError((current) => (current === error ? null : current))
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [error])

  const skipBackdropClick = useRef(false)

  const fetchMembers = useCallback(async () => {
    const { data, error: membersError } = await supabase
      .from('members')
      .select('id, name, email')
      .order('name', { ascending: true })

    if (membersError) {
      setError(membersError.message)
      return
    }

    setMembers(data ?? [])
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
    setPushSupported(supported)
    if (!supported || !session) {
      setPushEnabled(false)
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => {
        setPushEnabled(false)
      })
  }, [session])

  useEffect(() => {
    setPushPromptDismissed(false)
  }, [session?.user?.id])

  useEffect(() => {
    const sessionEmail = session?.user?.email
    if (!sessionEmail) {
      setCurrentMember(null)
      setUserRole('guest')
      setIsAdmin(false)
      setRoleFromAllowlist(null)
      setBookings([])
      setTemplateBookings([])
      setTemplateExceptions([])
      setShowNewBooking(false)
      setEditingBooking(null)
      setEditingTemplate(null)
      setIsMemberLoading(false)
      return
    }

    const loadCurrentMember = async () => {
      setIsMemberLoading(true)
      const { data: allowed, error: allowedError } = await supabase
        .from('allowed_member')
        .select('email, name, role, is_admin')
        .ilike('email', sessionEmail)
        .maybeSingle()

      if (allowedError) {
        setError(allowedError.message)
        setIsMemberLoading(false)
        return
      }

      if (!allowed) {
        setCurrentMember(null)
        setUserRole('guest')
        setError('Your email is not authorized.')
        await supabase.auth.signOut({ scope: 'local' })
        setAuthView('signin')
        setIsMemberLoading(false)
        return
      }
      const resolvedRole: UserRole =
        allowed.role === 'admin' || allowed.role === 'coordinator' || allowed.role === 'guest'
          ? allowed.role
          : allowed.is_admin
            ? 'admin'
            : 'coordinator'
      setRoleFromAllowlist(resolvedRole)
      setUserRole(resolvedRole)
      setIsAdmin(resolvedRole === 'admin')

      const { data, error } = await supabase
        .from('members')
        .select('id, name, email')
        .ilike('email', sessionEmail)
        .maybeSingle()

      if (error) {
        setError(error.message)
        setIsMemberLoading(false)
        return
      }

      if (data) {
        setCurrentMember(data)
        fetchMembers()
        setIsMemberLoading(false)
        return
      }

      const { data: createdMember, error: createError } = await supabase
        .from('members')
        .insert({
          name: allowed.name,
          email: allowed.email?.toLowerCase(),
        })
        .select('id, name, email')
        .single()

      if (createError) {
        if ((createError as { code?: string }).code === '23505') {
          const { data: existingMember, error: existingError } = await supabase
            .from('members')
            .select('id, name, email')
            .ilike('email', sessionEmail)
            .maybeSingle()
          if (existingError) {
            setError(existingError.message)
            setIsMemberLoading(false)
            return
          }
          if (existingMember) {
            setCurrentMember(existingMember)
            fetchMembers()
            setIsMemberLoading(false)
            return
          }
        }
        setError(createError.message)
        setIsMemberLoading(false)
        return
      }

      setCurrentMember(createdMember)
      fetchMembers()

      if (resolvedRole === 'admin') {
        await supabase.from('admins').insert({ member_id: createdMember.id })
      }
      setIsMemberLoading(false)
    }

    loadCurrentMember()
  }, [fetchMembers, session])

  useEffect(() => {
    if (!currentMember) {
      setUserRole('guest')
      setIsAdmin(false)
      return
    }

    if (roleFromAllowlist !== null) {
      setUserRole(roleFromAllowlist)
      setIsAdmin(roleFromAllowlist === 'admin')
      return
    }

    const loadAdminStatus = async () => {
      const { data, error } = await supabase
        .from('admins')
        .select('member_id')
        .eq('member_id', currentMember.id)
        .maybeSingle()

      if (error) {
        setError(error.message)
        return
      }

      const nextRole: UserRole = data ? 'admin' : 'coordinator'
      setUserRole(nextRole)
      setIsAdmin(nextRole === 'admin')
    }

    loadAdminStatus()
  }, [currentMember, roleFromAllowlist])

  useEffect(() => {
    const url = new URL(window.location.href)
    const searchParams = url.searchParams
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
    const mode = searchParams.get('mode') || hashParams.get('type')

    if (mode === 'recovery') {
      setAuthView('setPassword')
    }

    if (mode === 'signup' || mode === 'login' || hashParams.get('type') === 'signup') {
      setStatus('Email confirmed. Please sign in.')
    }

    const code = searchParams.get('code')
    if (code && mode === 'recovery') {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError(error.message)
        }
      })
    }

    if (searchParams.has('code') || searchParams.has('mode') || searchParams.has('type')) {
      searchParams.delete('code')
      searchParams.delete('mode')
      searchParams.delete('type')
      url.hash = ''
      window.history.replaceState({}, document.title, url.toString())
    }
  }, [])

  const fetchBoats = useCallback(async () => {
    const { data, error: boatsError } = await supabase
      .from('boats')
      .select('id, name, type, code, weight, build_year, usage_type, in_service, notes')
      .order('type', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (boatsError) {
      setError(boatsError.message)
      return
    }

    setBoats(data ?? [])
  }, [])

  const fetchBoatPermissions = useCallback(async () => {
    const { data, error } = await supabase
      .from('boat_permissions')
      .select('boat_id, member_id')

    if (error) {
      setError(error.message)
      return
    }

    const map: Record<string, Set<string>> = {}
    ;(data ?? []).forEach((row: BoatPermission) => {
      if (!map[row.boat_id]) {
        map[row.boat_id] = new Set()
      }
      map[row.boat_id].add(row.member_id)
    })
    setBoatPermissions(map)
  }, [])

  const refreshBoatAccess = useCallback(async () => {
    await Promise.all([fetchBoats(), fetchBoatPermissions()])
  }, [fetchBoats, fetchBoatPermissions])

  const fetchAllowedMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('allowed_member')
      .select('id, email, name, role, is_admin')
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setAllowedMembers(
      (data ?? []).map((row) => ({
        ...row,
        role:
          row.role === 'admin' || row.role === 'coordinator' || row.role === 'guest'
            ? row.role
            : row.is_admin
              ? 'admin'
              : 'coordinator',
      })),
    )
  }, [])

  const fetchRiskAssessments = useCallback(async () => {
    if (!session) {
      setRiskAssessments([])
      return
    }

    let query = supabase
      .from('risk_assessments')
      .select(
        `id, member_id, coordinator_name, session_date, session_time, crew_type, boat_type, launch_supervision,
        visibility, river_level, water_conditions, air_temperature, wind_conditions, risk_actions,
        incoming_tide, created_at, members(name,email),
        booking_risk_assessments(id, booking_id, risk_assessment_id, bookings(${BOOKING_SELECT}))`,
      )
      .order('session_date', { ascending: false })
      .order('session_time', { ascending: false })

    if (!isAdmin && currentMember) {
      query = query.eq('member_id', currentMember.id)
    }

    const { data, error } = await query
    if (error) {
      setError(error.message)
      return
    }

    setRiskAssessments(
      (data ?? []).map((assessment) => ({
        ...assessment,
        members: Array.isArray(assessment.members) ? assessment.members[0] ?? null : assessment.members ?? null,
        booking_risk_assessments: (assessment.booking_risk_assessments ?? []).map((link) => ({
          ...link,
          bookings: normalizeLinkedBooking(link.bookings),
        })),
      })),
    )
  }, [currentMember, isAdmin, session])

  const resetRiskAssessmentForm = () => {
    setRiskAssessmentForm({
      coordinator_name: '',
      session_date: '',
      session_time: '',
      crew_type: '',
      boat_type: '',
      launch_supervision: '',
      visibility: '',
      river_level: '',
      water_conditions: '',
      air_temperature: '',
      wind_conditions: '',
      risk_actions: '',
      incoming_tide: '',
    })
    setRiskAssessmentBooking(null)
    setEditingRiskAssessment(null)
    setLinkedRiskAssessment(null)
    setAvailableRiskAssessments([])
    setIsRiskAssessmentLoading(false)
    setRiskAssessmentReadOnly(false)
  }

  const openRiskAssessmentEditor = async (
    booking: Booking,
    options?: { readOnly?: boolean },
  ) => {
    setError(null)
    setStatus(null)

    if (!options?.readOnly && !canOpenRiskAssessment(booking)) {
      setError(getRiskAssessmentAvailabilityMessage(booking))
      return
    }

    setRiskAssessmentBooking(booking)
    setEditingRiskAssessment(null)
    setLinkedRiskAssessment(null)
    setAvailableRiskAssessments([])
    setIsRiskAssessmentLoading(true)
    setRiskAssessmentReadOnly(Boolean(options?.readOnly))
    const ownerMemberId = booking.member_id ?? currentMember?.id ?? ''

    const defaultForm = {
      coordinator_name: getRelatedName(booking.members) ?? currentMember?.name ?? '',
      session_date: toDateInputValue(booking.start_time),
      session_time: formatTimeInput(booking.start_time),
      crew_type: '',
      boat_type: '',
      launch_supervision: '',
      visibility: '',
      river_level: '',
      water_conditions: '',
      air_temperature: '',
      wind_conditions: '',
      risk_actions: '',
      incoming_tide: '',
    }

    const bookingDate = toDateInputValue(booking.start_time)
    const bookingTime = formatTimeInput(booking.start_time)

    const [linkedResult, availableResult] = await Promise.all([
      supabase
        .from('booking_risk_assessments')
        .select(
          `id, booking_id, risk_assessment_id, risk_assessments(
            id, member_id, coordinator_name, session_date, session_time, crew_type, boat_type,
            launch_supervision, visibility, river_level, water_conditions, air_temperature,
            wind_conditions, risk_actions, incoming_tide, created_at, members(name,email)
          )`,
        )
        .eq('booking_id', booking.id)
        .maybeSingle(),
      supabase
        .from('risk_assessments')
        .select(
          'id, member_id, coordinator_name, session_date, session_time, crew_type, boat_type, launch_supervision, visibility, river_level, water_conditions, air_temperature, wind_conditions, risk_actions, incoming_tide, created_at, members(name,email)',
        )
        .eq('member_id', ownerMemberId)
        .eq('session_date', bookingDate)
        .eq('session_time', bookingTime)
        .order('created_at', { ascending: false }),
    ])

    if (linkedResult.error) {
      setError(linkedResult.error.message)
      setRiskAssessmentForm(defaultForm)
      setIsRiskAssessmentLoading(false)
      return
    }

    if (availableResult.error) {
      setError(availableResult.error.message)
      setRiskAssessmentForm(defaultForm)
      setIsRiskAssessmentLoading(false)
      return
    }

    const linkedData = (linkedResult.data?.risk_assessments ?? null) as
      | (RiskAssessment & { members?: RiskAssessment['members'] })
      | RiskAssessment[]
      | null
    const normalizedLinked =
      linkedData && !Array.isArray(linkedData)
        ? {
            ...linkedData,
            members: Array.isArray(linkedData.members)
              ? linkedData.members[0] ?? null
              : linkedData.members ?? null,
            booking_risk_assessments: [],
          }
        : null

    const availableData = (availableResult.data ?? []).map((assessment) => ({
      ...assessment,
      members: Array.isArray(assessment.members) ? assessment.members[0] ?? null : assessment.members ?? null,
      booking_risk_assessments: [],
    }))

    setAvailableRiskAssessments(availableData)

    if (normalizedLinked) {
      setLinkedRiskAssessment(normalizedLinked)
      setEditingRiskAssessment(normalizedLinked)
      setRiskAssessmentForm({
        coordinator_name: normalizedLinked.coordinator_name,
        session_date: normalizedLinked.session_date,
        session_time: normalizedLinked.session_time,
        crew_type: normalizedLinked.crew_type,
        boat_type: normalizedLinked.boat_type,
        launch_supervision: normalizedLinked.launch_supervision,
        visibility: normalizedLinked.visibility,
        river_level: normalizedLinked.river_level,
        water_conditions: normalizedLinked.water_conditions,
        air_temperature: normalizedLinked.air_temperature,
        wind_conditions: normalizedLinked.wind_conditions,
        risk_actions: normalizedLinked.risk_actions,
        incoming_tide: normalizedLinked.incoming_tide,
      })
    } else {
      if (options?.readOnly) {
        setError('No linked risk assessment was found for this booking.')
        resetRiskAssessmentForm()
        return
      }
      setRiskAssessmentForm(defaultForm)
    }

    setIsRiskAssessmentLoading(false)
  }

  const fetchPendingBookings = useCallback(async () => {
    if (!session || !currentMember) {
      setPendingBookings([])
      return
    }

    setIsPendingLoading(true)
    let query = supabase
      .from('bookings')
      .select(
        BOOKING_SELECT,
      )
      .eq('usage_status', 'pending')
      .order('end_time', { ascending: true })

    if (!isAdmin) {
      query = query.eq('member_id', currentMember.id)
    }

    const { data, error } = await query
    setIsPendingLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    const nextPendingBookings = data ?? []
    setPendingBookings(nextPendingBookings)
    if (
      selectedPendingBookingId &&
      !nextPendingBookings.some((booking) => booking.id === selectedPendingBookingId)
    ) {
      setSelectedPendingBookingId(null)
    }
  }, [currentMember, isAdmin, selectedPendingBookingId, session])

  const fetchPendingTemplateConfirmations = useCallback(async () => {
    if (!session || !currentMember) {
      setPendingTemplateConfirmations([])
      return
    }

    let query = supabase
      .from('template_confirmations')
      .select(
        'id, template_id, member_id, occurrence_date, status, booking_id, notified_at, responded_at, booking_templates(id, boat_id, member_id, weekday, start_time, end_time, boat_label, member_label, boats(name,type), members(name,email)), members(name,email)',
      )
      .eq('status', 'pending')
      .order('occurrence_date', { ascending: true })

    if (!isAdmin) {
      query = query.eq('member_id', currentMember.id)
    }

    const { data, error } = await query
    if (error) {
      setError(error.message)
      return
    }

    const pendingRows = data ?? []
    if (pendingRows.length === 0) {
      setPendingTemplateConfirmations([])
      return
    }

    const occurrenceDates = Array.from(new Set(pendingRows.map((item) => item.occurrence_date)))
    const { data: exceptions, error: exceptionsError } = await supabase
      .from('template_exceptions')
      .select('template_id, exception_date')
      .in('exception_date', occurrenceDates)

    if (exceptionsError) {
      setError(exceptionsError.message)
      return
    }

    const today = getTodayString()
    const exceptionSet = new Set(
      (exceptions ?? []).map((item) => `${item.template_id}:${item.exception_date}`),
    )

    setPendingTemplateConfirmations(
      pendingRows
        .filter(
          (item) =>
            item.occurrence_date >= today &&
            !exceptionSet.has(`${item.template_id}:${item.occurrence_date}`),
        )
        .map((item) => ({
          ...item,
          booking_templates: normalizeTemplateBooking(item.booking_templates),
          members: Array.isArray(item.members) ? item.members[0] ?? null : item.members ?? null,
        })),
    )
  }, [currentMember, isAdmin, session])

  const refreshScheduleDay = useCallback(async (date: string) => {
    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const [{ data: bookingsData }, { data: exceptionsData }] = await Promise.all([
      supabase
        .from('bookings')
        .select(BOOKING_SELECT)
        .lt('start_time', dayEnd.toISOString())
        .gt('end_time', dayStart.toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('template_exceptions')
        .select('id, template_id, exception_date')
        .eq('exception_date', date),
    ])

    setBookings(bookingsData ?? [])
    setTemplateExceptions(exceptionsData ?? [])
  }, [])

  const filteredBoats = useMemo(() => {
    if (!boatTypeFilter) {
      return boats
    }
    return boats.filter((boat) => (boat.type ?? '').startsWith(boatTypeFilter))
  }, [boats, boatTypeFilter])

  const allowedBoats = useMemo(() => {
    const memberId = currentMember?.id
    if (!memberId && !isAdmin) {
      return []
    }
    return boats.filter((boat) => {
      const usage = (boat.usage_type ?? '').toLowerCase()
      if (usage === 'restricted') {
        return false
      }
      if (usage === 'captains permission') {
        return isAdmin || (memberId ? boatPermissions[boat.id]?.has(memberId) : false)
      }
      return true
    })
  }, [boats, boatPermissions, currentMember, isAdmin])

  const bookingBoatsSource = useMemo(() => {
    return isAdmin ? boats : allowedBoats
  }, [allowedBoats, boats, isAdmin])

  const filteredBookingBoats = useMemo(() => {
    if (!boatSearch) {
      return bookingBoatsSource
    }
    const query = boatSearch.toLowerCase()
    return bookingBoatsSource.filter((boat) => {
      const name = boat.name.toLowerCase()
      const type = (boat.type ?? '').toLowerCase()
      return name.includes(query) || type.includes(query)
    })
  }, [boatSearch, bookingBoatsSource])

  const boatTypeOptions = ['1', '2', '4', '8']

  useEffect(() => {
    fetchBoats()
  }, [fetchBoats])

  useEffect(() => {
    if (viewMode === 'boats') {
      fetchBoats()
    }
  }, [fetchBoats, viewMode])

  useEffect(() => {
    if (!session || !currentMember) {
      setPendingBookings([])
      return
    }

    fetchPendingBookings()
    fetchPendingTemplateConfirmations()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPendingBookings()
        fetchPendingTemplateConfirmations()
      }
    }

    const interval = window.setInterval(() => {
      fetchPendingBookings()
      fetchPendingTemplateConfirmations()
    }, 60000)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [currentMember, fetchPendingBookings, fetchPendingTemplateConfirmations, session])

  useEffect(() => {
    fetchBoatPermissions()
  }, [fetchBoatPermissions])

  useEffect(() => {
    if (viewMode === 'access' && canManageAccess) {
      fetchAllowedMembers()
    }
  }, [canManageAccess, fetchAllowedMembers, viewMode])

  useEffect(() => {
    if (
      (viewMode === 'templates' && !isAdmin) ||
      (viewMode === 'access' && !canManageAccess) ||
      (viewMode === 'riskAssessments' && !isAdmin)
    ) {
      setViewMode('schedule')
    }
  }, [canManageAccess, isAdmin, viewMode])

  useEffect(() => {
    if (viewMode === 'riskAssessments' && session) {
      fetchRiskAssessments()
    }
  }, [fetchRiskAssessments, session, viewMode])

  useEffect(() => {
    if (hasBlockingPendingConfirmations && viewMode !== 'pendingConfirmations') {
      setShowNewBooking(false)
      setEditingBooking(null)
      setEditingTemplate(null)
      setEditingBoat(null)
      setShowAccessEditor(false)
      setIsMenuOpen(false)
      setViewMode('pendingConfirmations')
    }

    if (!hasBlockingPendingConfirmations && viewMode === 'pendingConfirmations' && !isAdmin) {
      setViewMode('schedule')
    }
  }, [hasBlockingPendingConfirmations, isAdmin, viewMode])

  useEffect(() => {
    if (currentMember && !isAdmin && viewMode === 'schedule') {
      setBookingMemberId(currentMember.id)
    }
  }, [currentMember, isAdmin, viewMode])

  useEffect(() => {
    if (!editingBooking) {
      setBookingHasLinkedRiskAssessment(false)
      return
    }

    let cancelled = false

    supabase
      .from('booking_risk_assessments')
      .select('id')
      .eq('booking_id', editingBooking.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) {
          return
        }
        if (error) {
          setBookingHasLinkedRiskAssessment(false)
          return
        }
        setBookingHasLinkedRiskAssessment(Boolean(data))
      })

    return () => {
      cancelled = true
    }
  }, [editingBooking])

  useEffect(() => {
    if (viewMode !== 'schedule' || !session) {
      return
    }

    const loadBookings = async () => {
      const dayStart = new Date(`${selectedDate}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const weekday = getWeekdayIndex(selectedDate)

      setIsLoading(true)
      const [bookingsResult, templatesResult, exceptionsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(BOOKING_SELECT)
          .lt('start_time', dayEnd.toISOString())
          .gt('end_time', dayStart.toISOString())
          .order('start_time', { ascending: true }),
        supabase
          .from('booking_templates')
          .select(
            'id, boat_id, member_id, weekday, start_time, end_time, boat_label, member_label, boats(name,type), members(name)',
          )
          .eq('weekday', weekday)
          .order('start_time', { ascending: true }),
        supabase
          .from('template_exceptions')
          .select('id, template_id, exception_date')
          .eq('exception_date', selectedDate),
      ])

      setIsLoading(false)

      if (bookingsResult.error) {
        setError(bookingsResult.error.message)
        return
      }

      if (templatesResult.error) {
        setError(templatesResult.error.message)
        return
      }

      if (exceptionsResult.error) {
        setError(exceptionsResult.error.message)
        return
      }

      setBookings(bookingsResult.data ?? [])
      setTemplateBookings(templatesResult.data ?? [])
      setTemplateExceptions(exceptionsResult.data ?? [])
    }

    loadBookings()
  }, [selectedDate, session, viewMode])

  useEffect(() => {
    if (viewMode !== 'templates' || !session) {
      return
    }

    const loadTemplates = async () => {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('booking_templates')
        .select(
          'id, boat_id, member_id, weekday, start_time, end_time, boat_label, member_label, boats(name,type), members(name)',
        )
        .eq('weekday', selectedTemplateWeekday)
        .order('start_time', { ascending: true })
      setIsLoading(false)

      if (error) {
        setError(error.message)
        return
      }

      setTemplateBookings(data ?? [])
    }

    loadTemplates()
  }, [selectedTemplateWeekday, session, viewMode])

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const excludedTemplateIds = new Set(
      templateExceptions.map((exception) => exception.template_id),
    )

    const fromTemplates: ScheduleItem[] = templateBookings
      .filter(
        (template) =>
          viewMode === 'templates' ||
          (!excludedTemplateIds.has(template.id) && selectedDate >= getTodayString()),
      )
      .map((template) => {
        const startTime = normalizeTime(template.start_time)
        const endTime = normalizeTime(template.end_time)
        const baseDate =
          viewMode === 'templates'
            ? new Date(`2000-01-01T${startTime}:00`)
            : new Date(`${selectedDate}T${startTime}:00`)
        const endDate =
          viewMode === 'templates'
            ? new Date(`2000-01-01T${endTime}:00`)
            : new Date(`${selectedDate}T${endTime}:00`)
        return {
          id: `template-${template.id}`,
          templateId: template.id,
          boat_id: template.boat_id,
          member_id: template.member_id,
          start_time: baseDate.toISOString(),
          end_time: endDate.toISOString(),
          boats: template.boats ?? null,
          members: template.members ?? null,
          boat_label: template.boat_label ?? null,
          member_label: template.member_label ?? null,
          weekday: template.weekday,
          isTemplate: true,
        }
      })

    if (viewMode === 'templates') {
      return fromTemplates
    }

    const fromBookings: ScheduleItem[] = bookings.map((booking) => ({
      ...booking,
      isTemplate: false,
    })).filter((booking) => booking.usage_status !== 'cancelled')

    return [...fromTemplates, ...fromBookings]
  }, [bookings, templateBookings, selectedDate, templateExceptions, viewMode])

  const ganttLayout = useMemo(() => {
    const timelineStart = START_HOUR
    const timelineEnd = END_HOUR
    const dayBase = viewMode === 'templates' ? '2000-01-01' : selectedDate
    const dayStart = new Date(`${dayBase}T07:30:00`)
    const dayStartMs = dayStart.getTime()

    const items = scheduleItems
      .map((item) => {
        const startMs = new Date(item.start_time).getTime()
        const endMs = new Date(item.end_time).getTime()
        const startMinutes = (startMs - dayStartMs) / 60000
        const endMinutes = (endMs - dayStartMs) / 60000
        return {
          ...item,
          startMinutes,
          endMinutes,
        }
      })
      .filter(
        (item) => item.endMinutes > 0 && item.startMinutes < (timelineEnd - timelineStart) * 60,
      )
      .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes)

    const laneEnds: number[] = []
    const itemsWithLane = items.map((item) => {
      let laneIndex = laneEnds.findIndex((end) => item.startMinutes >= end)
      if (laneIndex === -1) {
        laneIndex = laneEnds.length
      }
      laneEnds[laneIndex] = item.endMinutes
      return { ...item, lane: laneIndex }
    })

    return {
      timelineStart,
      timelineEnd,
      totalHours: timelineEnd - timelineStart,
      items: itemsWithLane,
      lanes: Math.max(1, laneEnds.length),
    }
  }, [scheduleItems, selectedDate])

  const resetBookingForm = () => {
    setShowNewBooking(false)
    setEditingBooking(null)
    setEditingTemplate(null)
    setBookingBoatId('')
    setBookingBoatIds([])
    setBoatSearch('')
    if (currentMember && !isAdmin && viewMode === 'schedule') {
      setBookingMemberId(currentMember.id)
    } else {
      setBookingMemberId('')
    }
    setStartTime('07:30')
    setEndTime('08:30')
  }

  const canEditBooking = (booking: { member_id: string | null }) => {
    if (isGuest) {
      return false
    }
    if (isAdmin) {
      return true
    }
    return Boolean(currentMember && booking.member_id === currentMember.id)
  }

  const canModifyBooking = (booking: Booking) => {
    if (!canEditBooking(booking)) {
      return false
    }
    if (isPendingBooking(booking)) {
      return false
    }
    if (isPastBooking(booking)) {
      return false
    }
    return true
  }
  const isEditingBookingLocked = editingBooking ? !canModifyBooking(editingBooking) : false

  const canEditTemplate = (item: { member_id: string | null }) => {
    if (isGuest) {
      return false
    }
    if (isAdmin) {
      return true
    }
    return Boolean(currentMember && item.member_id === currentMember.id)
  }

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const subscribeToPush = useCallback(async () => {
    if (!pushSupported) {
      setError('Push notifications are not supported in this browser.')
      return
    }

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
    if (!vapidPublicKey) {
      setError('Missing VAPID public key.')
      return
    }

    setPushBusy(true)
    setError(null)
    setStatus(null)

    try {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission

      if (permission !== 'granted') {
        setError('Notification permission was not granted.')
        setPushBusy(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }))

      const token = await getAccessToken()
      if (!token) {
        setError('You must be signed in to enable notifications.')
        setPushBusy(false)
        return
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON ? subscription.toJSON() : subscription,
          userAgent: navigator.userAgent,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to save subscription.')
      }

      setPushEnabled(true)
      setStatus('Notifications enabled.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable notifications.'
      setError(message)
    } finally {
      setPushBusy(false)
    }
  }, [getAccessToken, pushSupported])

  const unsubscribeFromPush = useCallback(async () => {
    if (!pushSupported) {
      return
    }

    setPushBusy(true)
    setError(null)
    setStatus(null)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        setPushEnabled(false)
        setPushBusy(false)
        return
      }

      const token = await getAccessToken()
      if (token) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }

      await subscription.unsubscribe()
      setPushEnabled(false)
      setStatus('Notifications disabled.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable notifications.'
      setError(message)
    } finally {
      setPushBusy(false)
    }
  }, [getAccessToken, pushSupported])

  const handleSignUp = async () => {
    setError(null)
    setStatus(null)

    const normalizedEmail = signupEmail.trim().toLowerCase()
    if (!normalizedEmail || !signupPassword || !signupConfirm) {
      setError('Enter your email and password twice.')
      return
    }

    if (signupPassword !== signupConfirm) {
      setError('Passwords do not match.')
      return
    }

    setIsSendingEmail(true)

    const { data: allowed, error: allowedError } = await supabase
      .from('allowed_member')
      .select('email')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (allowedError) {
      setError(allowedError.message)
      setIsSendingEmail(false)
      return
    }

    if (!allowed) {
      setError('This email is not authorized.')
      setIsSendingEmail(false)
      return
    }

    const { error: signupError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: `${import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() || window.location.origin}?mode=login`,
      },
    })

    setIsSendingEmail(false)

    if (signupError) {
      setError(signupError.message)
      return
    }

    setStatus(`Confirm your email to finish signup: ${normalizedEmail}.`)
    setSignupPassword('')
    setSignupConfirm('')
  }

  const handlePasswordLogin = async () => {
    setError(null)
    setStatus(null)
    const email = loginEmail.trim().toLowerCase()
    if (!email || !loginPassword) {
      setError('Enter your email and password.')
      return
    }
    setIsAuthBusy(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    })
    setIsAuthBusy(false)

    if (loginError) {
      setError(loginError.message)
      return
    }
  }

  const handlePasswordReset = async () => {
    setError(null)
    setStatus(null)
    const email = loginEmail.trim().toLowerCase()
    if (!email) {
      setError('Enter your email to reset your password.')
      return
    }
    setIsAuthBusy(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() || window.location.origin}?mode=recovery`,
    })
    setIsAuthBusy(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setStatus(`Password reset email sent to ${email}.`)
  }

  const handleSetPassword = async () => {
    setError(null)
    setStatus(null)

    if (!newPassword || !confirmPassword) {
      setError('Enter your new password twice.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsAuthBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    setIsAuthBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setStatus('Password updated. You are logged in.')
    setAuthView('signin')
    setNewPassword('')
    setConfirmPassword('')
    const url = new URL(window.location.href)
    url.searchParams.delete('mode')
    window.history.replaceState({}, document.title, url.toString())
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      await supabase.auth.signOut({ scope: 'local' })
    }
    setStatus('Logged out.')
    setAuthView('signin')
  }

  const openBoatEditor = (boat?: Boat) => {
    if (!boat) {
      setEditingBoat({
        id: '',
        name: '',
        type: null,
      })
      setBoatForm({
        code: '',
        name: '',
        type: '',
        weight: '',
        build_year: '',
        usage_type: '',
        in_service: '',
        notes: '',
      })
      setBoatPermissionIds([])
      setSelectedPermissionMemberId('')
      return
    }
    setEditingBoat(boat)
    setBoatForm({
      code: boat.code ?? '',
      name: boat.name ?? '',
      type: boat.type ?? '',
      weight: boat.weight ?? '',
      build_year: boat.build_year ?? '',
      usage_type: boat.usage_type ?? '',
      in_service: boat.in_service ?? '',
      notes: boat.notes ?? '',
    })
    const boatPerms = boatPermissions[boat.id]
    setBoatPermissionIds(boatPerms ? Array.from(boatPerms) : [])
    setSelectedPermissionMemberId('')
  }

  const handleSaveBoat = async () => {
    if (!editingBoat) {
      return
    }

    setError(null)
    setStatus(null)

    const payload = {
      code: boatForm.code || null,
      name: boatForm.name || null,
      type: boatForm.type || null,
      weight: boatForm.weight || null,
      build_year: boatForm.build_year || null,
      usage_type: boatForm.usage_type || null,
      in_service: boatForm.in_service || null,
      notes: boatForm.notes || null,
    }

    const { data: savedBoat, error } = editingBoat.id
      ? await supabase.from('boats').update(payload).eq('id', editingBoat.id).select('id').single()
      : await supabase.from('boats').insert(payload).select('id').single()

    if (error) {
      setError(error.message)
      return
    }

    const boatId = savedBoat?.id ?? editingBoat.id

    if (boatForm.usage_type.toLowerCase() === 'captains permission' && boatId) {
      await supabase.from('boat_permissions').delete().eq('boat_id', boatId)
      if (boatPermissionIds.length > 0) {
        const inserts = boatPermissionIds.map((memberId) => ({
          boat_id: boatId,
          member_id: memberId,
        }))
        const { error: permsError } = await supabase.from('boat_permissions').insert(inserts)
        if (permsError) {
          setError(permsError.message)
          return
        }
      }
      fetchBoatPermissions()
    }

    setStatus(editingBoat.id ? 'Boat updated' : 'Boat created')
    setEditingBoat(null)
    fetchBoats()
  }

  const handleDeleteBoat = async () => {
    if (!editingBoat || !editingBoat.id) {
      return
    }

    const confirmDelete = window.confirm('Are you sure you want to delete this boat?')
    if (!confirmDelete) {
      return
    }

    setError(null)
    setStatus(null)

    const { error } = await supabase.from('boats').delete().eq('id', editingBoat.id)

    if (error) {
      setError(error.message)
      return
    }

    setStatus('Boat deleted')
    setEditingBoat(null)
    fetchBoats()
  }

  const getWeekdayOptions = () => [
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
    { label: 'Sunday', value: 0 },
  ]

  const handleSaveTemplate = async () => {
    setError(null)
    setStatus(null)

    if (!isAdmin) {
      setError('Only admins can edit templates.')
      return
    }

    if (!bookingMemberId) {
      setError('Select a member for the template.')
      return
    }

    const start = startTime
    const end = endTime

    if (!start || !end) {
      setError('Enter a valid start and end time.')
      return
    }

    if (end <= start) {
      setError('End time must be after start time.')
      return
    }

    if (bookingBoatId) {
      const { data: conflicts, error: conflictError } = await supabase
        .from('booking_templates')
        .select('id, start_time, end_time')
        .eq('weekday', selectedTemplateWeekday)
        .eq('boat_id', bookingBoatId)
        .lt('start_time', end)
        .gt('end_time', start)

      if (conflictError) {
        setError(conflictError.message)
        return
      }

      const filteredConflicts =
        editingTemplate?.templateId && conflicts
          ? conflicts.filter((row) => row.id !== editingTemplate.templateId)
          : conflicts

      if (filteredConflicts && filteredConflicts.length > 0) {
        const message = 'That boat already has a template booking in this time range.'
        setError(null)
        window.alert(message)
        return
      }
    }

    const boatName = boats.find((boat) => boat.id === bookingBoatId)?.name ?? ''
    const memberName = members.find((member) => member.id === bookingMemberId)?.name ?? ''

    const payload = {
      weekday: selectedTemplateWeekday,
      boat_id: bookingBoatId || null,
      member_id: bookingMemberId,
      start_time: start,
      end_time: end,
      boat_label: boatName || 'Generic',
      member_label: memberName || 'Member',
    }

    if (editingTemplate?.templateId) {
      const { error: updateError } = await supabase
        .from('booking_templates')
        .update(payload)
        .eq('id', editingTemplate.templateId)

      if (updateError) {
        setError(updateError.message)
        return
      }

      setStatus('Template booking updated')
    } else {
      const { error: insertError } = await supabase.from('booking_templates').insert(payload)
      if (insertError) {
        setError(insertError.message)
        return
      }
      setStatus('Template booking created')
    }

    resetBookingForm()

    const { data, error } = await supabase
      .from('booking_templates')
      .select(
        'id, boat_id, member_id, weekday, start_time, end_time, boat_label, member_label, boats(name,type), members(name)',
      )
      .eq('weekday', selectedTemplateWeekday)
      .order('start_time', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setTemplateBookings(data ?? [])
  }

  const handleDeleteTemplateRow = async () => {
    if (!editingTemplate?.templateId) {
      return
    }

    setError(null)
    setStatus(null)

    if (!isAdmin) {
      setError('Only admins can edit templates.')
      return
    }

    const { error: deleteError } = await supabase
      .from('booking_templates')
      .delete()
      .eq('id', editingTemplate.templateId)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setTemplateBookings((prev) => prev.filter((item) => item.id !== editingTemplate.templateId))
    setStatus('Template booking removed')
    resetBookingForm()
  }

  const handleSaveBooking = async () => {
    setError(null)
    setStatus(null)

    if (isGuest) {
      setError('Guests have read-only access.')
      return
    }

    const selectedBoatIds = editingBooking
      ? bookingBoatId
        ? [bookingBoatId]
        : []
      : bookingBoatIds
    if (selectedBoatIds.length === 0) {
      setError('Select at least one boat for the booking.')
      return
    }

    const effectiveMemberId = isAdmin ? bookingMemberId : currentMember?.id ?? ''
    if (!effectiveMemberId) {
      setError('Select a member for the booking.')
      return
    }

    if (!isAdmin && editingBooking && !canEditBooking(editingBooking)) {
      setError('You can only edit your own bookings.')
      return
    }

    for (const boatId of selectedBoatIds) {
      const boat = boats.find((item) => item.id === boatId)
      const usage = (boat?.usage_type ?? '').toLowerCase()
      if (usage === 'restricted') {
        window.alert('One of the selected boats is restricted and cannot be booked.')
        return
      }
      if (usage === 'captains permission' && !isAdmin) {
        const memberId = currentMember?.id
        if (!memberId || !boatPermissions[boatId]?.has(memberId)) {
          window.alert('You do not have permission to book one of the selected boats.')
          return
        }
      }
    }

    const startDate = toDateTime(selectedDate, startTime)
    const endDate = toDateTime(selectedDate, endTime)
    const minStart = toDateTime(selectedDate, '07:30')
    const now = new Date()

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError('Enter a valid start and end time.')
      return
    }

    if (editingBooking && !canModifyBooking(editingBooking)) {
      setError('Past bookings and bookings waiting for confirmation cannot be modified.')
      return
    }

    if (startDate < now) {
      setError('You cannot create or move a booking into the past.')
      return
    }

    if (startDate < minStart) {
      const message = 'Start time must be 07:30 or later.'
      setError(null)
      window.alert(message)
      return
    }

    if (endDate <= startDate) {
      setError('End time must be after start time.')
      return
    }

    let conflictQuery = supabase
      .from('bookings')
      .select('id, boat_id')
      .in('boat_id', selectedBoatIds)
      .lt('start_time', endDate.toISOString())
      .gt('end_time', startDate.toISOString())

    if (editingBooking) {
      conflictQuery = conflictQuery.neq('id', editingBooking.id)
    }

    const { data: conflicts, error: conflictError } = await conflictQuery

    if (conflictError) {
      setError(conflictError.message)
      return
    }

    const templateConflicts = templateBookings.filter((template) => {
      if (!template.boat_id) {
        return false
      }
      if (!selectedBoatIds.includes(template.boat_id)) {
        return false
      }
      const startTime = normalizeTime(template.start_time)
      const endTime = normalizeTime(template.end_time)
      const templateStart = new Date(`${selectedDate}T${startTime}:00`)
      const templateEnd = new Date(`${selectedDate}T${endTime}:00`)
      return templateStart < endDate && templateEnd > startDate
    })

    if (templateConflicts.length > 0) {
      const names = templateConflicts
        .map((template) => boats.find((boat) => boat.id === template.boat_id)?.name ?? 'Boat')
        .filter(Boolean)
      const message = `Default booking conflict for: ${names.join(', ')}.`
      setError(null)
      window.alert(message)
      return
    }

    if (conflicts && conflicts.length > 0) {
      const conflictNames = Array.from(
        new Set(
          conflicts
            .map((row: { boat_id?: string }) =>
              boats.find((boat) => boat.id === row.boat_id)?.name ?? null,
            )
            .filter(Boolean),
        ),
      )
      const message = `Boat already booked: ${conflictNames.join(', ')}.`
      setError(null)
      window.alert(message)
      return
    }

    if (editingBooking) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          boat_id: bookingBoatId,
          member_id: effectiveMemberId,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        })
        .eq('id', editingBooking.id)

      if (updateError) {
        setError(updateError.message)
        return
      }
      setStatus('Booking updated.')
    } else {
      const inserts = selectedBoatIds.map((boatId) => ({
        boat_id: boatId,
        member_id: effectiveMemberId,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      }))
      const { error: insertError } = await supabase
        .from('bookings')
        .insert(inserts)
        .select('id')

      if (insertError) {
        setError(insertError.message)
        return
      }
      setStatus(inserts.length > 1 ? 'Bookings confirmed!' : 'Booking confirmed!')
    }

    resetBookingForm()

    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data } = await supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .lt('start_time', dayEnd.toISOString())
      .gt('end_time', dayStart.toISOString())
      .order('start_time', { ascending: true })

    setBookings(data ?? [])
  }

  const handleDeleteBooking = async () => {
    if (!editingBooking) {
      return
    }

    setError(null)
    setStatus(null)

    if (!canModifyBooking(editingBooking)) {
      setError('Past bookings and bookings waiting for confirmation cannot be deleted.')
      return
    }

    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .eq('id', editingBooking.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setStatus('Booking deleted.')
    resetBookingForm()

    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data } = await supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .lt('start_time', dayEnd.toISOString())
      .gt('end_time', dayStart.toISOString())
      .order('start_time', { ascending: true })

    setBookings(data ?? [])
  }

  const handleDeleteTemplate = async () => {
    if (!editingTemplate?.templateId) {
      return
    }

    setError(null)
    setStatus(null)

    if (!canEditTemplate(editingTemplate)) {
      setError('You can only edit your own template bookings.')
      return
    }

    const { data: exceptionRow, error: insertError } = await supabase
      .from('template_exceptions')
      .insert({
        template_id: editingTemplate.templateId,
        exception_date: selectedDate,
      })
      .select('id, template_id, exception_date')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    await supabase.from('template_confirmations').upsert(
      {
        template_id: editingTemplate.templateId,
        member_id: editingTemplate.member_id,
        occurrence_date: selectedDate,
        status: 'cancelled',
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'template_id,occurrence_date' },
    )

    const optimisticException = exceptionRow ?? {
      id: `local-${editingTemplate.templateId}-${selectedDate}`,
      template_id: editingTemplate.templateId,
      exception_date: selectedDate,
    }
    setTemplateExceptions((prev) => [...prev, optimisticException])
    setTemplateBookings((prev) =>
      prev.filter((template) => template.id !== editingTemplate.templateId),
    )
    setEditingTemplate(null)
    setStatus('Booking removed')
  }

  const handleResolvePendingBooking = async (
    booking: Booking,
    usageStatus: 'confirmed' | 'cancelled',
  ) => {
    if (!currentMember) {
      return
    }

    setPendingActionId(booking.id)
    setError(null)
    setStatus(null)

    const canResolve = isAdmin || booking.member_id === currentMember.id
    if (!canResolve) {
      setError('You can only confirm your own completed bookings.')
      setPendingActionId(null)
      return
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        usage_status: usageStatus,
        usage_confirmed_at: new Date().toISOString(),
        usage_confirmed_by: currentMember.id,
      })
      .eq('id', booking.id)
      .eq('usage_status', 'pending')

    if (updateError) {
      setError(updateError.message)
      setPendingActionId(null)
      return
    }

    setStatus(usageStatus === 'confirmed' ? 'Outing confirmed.' : 'Booking marked as not used.')
    await Promise.all([
      fetchPendingBookings(),
      viewMode === 'schedule' && selectedDate === booking.start_time.slice(0, 10)
        ? refreshScheduleDay(selectedDate)
        : Promise.resolve(),
    ])
    setPendingActionId(null)
  }

  const resolveTemplateOccurrence = useCallback(
    async ({
      confirmationId,
      template,
      templateId,
      memberId,
      occurrenceDate,
      nextStatus,
    }: {
      confirmationId?: string | null
      template: TemplateBooking
      templateId: string
      memberId: string
      occurrenceDate: string
      nextStatus: 'confirmed' | 'cancelled'
    }) => {
      const exceptionPayload = {
        template_id: templateId,
        exception_date: occurrenceDate,
      }

      let insertedBookingId: string | null = null

      if (nextStatus === 'confirmed') {
        if (!template.boat_id) {
          throw new Error('This template has no boat assigned. Add a boat before confirming it.')
        }

        const startTime = normalizeTime(template.start_time)
        const endTime = normalizeTime(template.end_time)
        const bookingStart = new Date(`${occurrenceDate}T${startTime}:00`)
        const bookingEnd = new Date(`${occurrenceDate}T${endTime}:00`)

        const { data: conflicts, error: conflictError } = await supabase
          .from('bookings')
          .select('id')
          .eq('boat_id', template.boat_id)
          .lt('start_time', bookingEnd.toISOString())
          .gt('end_time', bookingStart.toISOString())

        if (conflictError) {
          throw new Error(conflictError.message)
        }

        if (conflicts && conflicts.length > 0) {
          throw new Error('A booking already exists for this boat during that time.')
        }

        const { data: insertedBooking, error: insertBookingError } = await supabase
          .from('bookings')
          .insert({
            boat_id: template.boat_id,
            member_id: memberId,
            start_time: bookingStart.toISOString(),
            end_time: bookingEnd.toISOString(),
          })
          .select('id')
          .single()

        if (insertBookingError) {
          throw new Error(insertBookingError.message)
        }

        insertedBookingId = insertedBooking.id
      }

      const { error: exceptionError } = await supabase
        .from('template_exceptions')
        .upsert(exceptionPayload, { onConflict: 'template_id,exception_date' })

      if (exceptionError) {
        throw new Error(exceptionError.message)
      }

      const respondedAt = new Date().toISOString()
      const { error: updateError } = confirmationId
        ? await supabase
            .from('template_confirmations')
            .update({
              status: nextStatus,
              booking_id: insertedBookingId,
              responded_at: respondedAt,
            })
            .eq('id', confirmationId)
        : await supabase.from('template_confirmations').upsert(
            {
              template_id: templateId,
              member_id: memberId,
              occurrence_date: occurrenceDate,
              status: nextStatus,
              booking_id: insertedBookingId,
              responded_at: respondedAt,
            },
            { onConflict: 'template_id,occurrence_date' },
          )

      if (updateError) {
        throw new Error(updateError.message)
      }

      await Promise.all([
        fetchPendingTemplateConfirmations(),
        fetchPendingBookings(),
        viewMode === 'schedule' && selectedDate === occurrenceDate
          ? refreshScheduleDay(occurrenceDate)
          : Promise.resolve(),
      ])
    },
    [
      fetchPendingBookings,
      fetchPendingTemplateConfirmations,
      refreshScheduleDay,
      selectedDate,
      viewMode,
    ],
  )

  const handleResolveTemplateConfirmation = async (
    confirmation: TemplateConfirmation,
    nextStatus: 'confirmed' | 'cancelled',
  ) => {
    if (!currentMember) {
      return
    }

    const template = normalizeTemplateBooking(confirmation.booking_templates)
    if (!template) {
      setError('Template booking not found.')
      return
    }

    setPendingTemplateActionId(confirmation.id)
    setError(null)
    setStatus(null)

    if (!isAdmin && confirmation.member_id !== currentMember.id) {
      setError('You can only confirm your own template bookings.')
      setPendingTemplateActionId(null)
      return
    }

    try {
      await resolveTemplateOccurrence({
        confirmationId: confirmation.id,
        template,
        templateId: confirmation.template_id,
        memberId: confirmation.member_id,
        occurrenceDate: confirmation.occurrence_date,
        nextStatus,
      })
      setStatus(
        nextStatus === 'confirmed'
          ? 'Template converted to a booking.'
          : 'Template booking removed for this date.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resolve template booking.')
    } finally {
      setPendingTemplateActionId(null)
    }
  }

  const handleConfirmTemplateBooking = async () => {
    if (!currentMember || !editingTemplate?.templateId || !editingTemplate.member_id) {
      return
    }

    if (!canEditTemplate(editingTemplate)) {
      setError('You can only confirm your own template bookings.')
      return
    }

    const template = templateBookings.find((item) => item.id === editingTemplate.templateId)
    if (!template) {
      setError('Template booking not found.')
      return
    }

    setPendingTemplateActionId(editingTemplate.templateId)
    setError(null)
    setStatus(null)

    try {
      await resolveTemplateOccurrence({
        template,
        templateId: editingTemplate.templateId,
        memberId: editingTemplate.member_id,
        occurrenceDate: selectedDate,
        nextStatus: 'confirmed',
      })
      setEditingTemplate(null)
      setStatus('Template converted to a booking.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm template booking.')
    } finally {
      setPendingTemplateActionId(null)
    }
  }

  const handleSaveRiskAssessment = async () => {
    if (!riskAssessmentBooking || !currentMember) {
      return
    }

    setError(null)
    setStatus(null)

    if (!canOpenRiskAssessment(riskAssessmentBooking)) {
      setError(getRiskAssessmentAvailabilityMessage(riskAssessmentBooking))
      return
    }

    const requiredValues = Object.values(riskAssessmentForm).map((value) => value.trim())
    if (requiredValues.some((value) => !value)) {
      setError('Complete all risk assessment fields.')
      return
    }

    const payload = {
      member_id: riskAssessmentBooking.member_id ?? currentMember.id,
      ...riskAssessmentForm,
      updated_at: new Date().toISOString(),
    }

    let riskAssessmentId = editingRiskAssessment?.id ?? null
    const isNewRiskAssessment = !editingRiskAssessment

    if (editingRiskAssessment) {
      const { error } = await supabase
        .from('risk_assessments')
        .update(payload)
        .eq('id', editingRiskAssessment.id)

      if (error) {
        setError(error.message)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('risk_assessments')
        .insert(payload)
        .select('id')
        .single()

      if (error) {
        setError(error.message)
        return
      }

      riskAssessmentId = data.id
    }

    if (!riskAssessmentId) {
      setError('Unable to link risk assessment to booking.')
      return
    }

    const { error: linkError } = await supabase.from('booking_risk_assessments').upsert(
      {
        booking_id: riskAssessmentBooking.id,
        risk_assessment_id: riskAssessmentId,
      },
      { onConflict: 'booking_id' },
    )

    if (linkError) {
      setError(linkError.message)
      return
    }

    if (isNewRiskAssessment) {
      const accessToken = await getAccessToken()
      if (accessToken) {
        await fetch('/api/push/notify-risk-assessment-admins', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            riskAssessmentId,
            bookingId: riskAssessmentBooking.id,
          }),
        }).catch(() => undefined)
      }
    }

    setStatus(editingRiskAssessment ? 'Risk assessment updated.' : 'Risk assessment created.')
    await fetchRiskAssessments()
    resetRiskAssessmentForm()
  }

  const handleLinkExistingRiskAssessment = async (assessment: RiskAssessment) => {
    if (!riskAssessmentBooking) {
      return
    }

    setError(null)
    setStatus(null)

    const { error } = await supabase.from('booking_risk_assessments').upsert(
      {
        booking_id: riskAssessmentBooking.id,
        risk_assessment_id: assessment.id,
      },
      { onConflict: 'booking_id' },
    )

    if (error) {
      setError(error.message)
      return
    }

    setStatus('Existing risk assessment linked.')
    await fetchRiskAssessments()
    resetRiskAssessmentForm()
  }

  const handleSaveAccess = async () => {
    setError(null)
    setStatus(null)

    if (!canManageAccess) {
      setError('You do not have permission to manage access.')
      return
    }

    const email = accessForm.email.trim().toLowerCase()
    const name = accessForm.name.trim()
    if (!email || !name) {
      setError('Enter a name and email.')
      return
    }

    const requestedRole = accessForm.role
    if ((isCoordinator && requestedRole !== 'guest') || (!isAdmin && !isCoordinator)) {
      setError('You are not allowed to create this type of user.')
      return
    }

    const { error } = await supabase.from('allowed_member').insert({
      email,
      name,
      role: requestedRole,
      is_admin: requestedRole === 'admin',
    })

    if (error) {
      setError(error.message)
      return
    }

    setStatus('Access added.')
    setAccessForm({ email: '', name: '', role: isCoordinator ? 'guest' : 'coordinator' })
    setShowAccessEditor(false)
    fetchAllowedMembers()
  }

  const handleDeleteAccess = async (member: { email: string; role?: UserRole | null; is_admin?: boolean }) => {
    if (!isAdmin) {
      setError('Only admins can remove access.')
      return
    }
    const confirmDelete = window.confirm('Remove this user access?')
    if (!confirmDelete) {
      return
    }

    setError(null)
    setStatus(null)

    const email = member.email.toLowerCase()

    const { data: memberRow, error: memberError } = await supabase
      .from('members')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (memberError) {
      setError(memberError.message)
      return
    }

    if (memberRow?.id) {
      await supabase.from('admins').delete().eq('member_id', memberRow.id)
      await supabase.from('members').delete().eq('id', memberRow.id)
    }

    const { error: allowError } = await supabase
      .from('allowed_member')
      .delete()
      .ilike('email', email)

    if (allowError) {
      setError(allowError.message)
      return
    }

    setStatus('Access removed.')
    fetchAllowedMembers()
  }

  return (
    <div
      className="app"
      onPointerDown={(event) => {
        if (status) {
          setStatus(null)
        }
        if (isMenuOpen) {
          const target = event.target as HTMLElement
          if (!target.closest('.menu-panel') && !target.closest('.menu-button')) {
            setIsMenuOpen(false)
          }
        }
      }}
    >
      {updateAvailable ? (
        <div className="update-banner">
          <span>New version available.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload now
          </button>
        </div>
      ) : null}
      {session && !hasBlockingPendingConfirmations ? (
        <div className="header-menu">
          <button
            className="menu-button"
            type="button"
            onClick={() => {
              setIsMenuOpen((prev) => {
                const next = !prev
                if (next) {
                  fetchPendingBookings()
                  fetchPendingTemplateConfirmations()
                }
                return next
              })
            }}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
          {isMenuOpen ? (
            <>
              <div className="menu-backdrop" onClick={() => setIsMenuOpen(false)} />
              <div className="menu-panel">
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    setShowNewBooking(false)
                    setEditingBooking(null)
                    setEditingTemplate(null)
                    setViewMode('schedule')
                  }}
                >
                  Book a boat
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    window.open(
                      'https://forms.office.com/pages/responsepage.aspx?id=-IfL4Xjbd0-GJ9xSeeWF3QcM_q2QJTNIkImQlQ8ffo1UMTJTOFJGTVpYWjM2N0hVM1Q0WUFVUDZDWi4u&route=shorturl',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }}
                >
                  Report an incident
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    window.open(
                      'https://river.grosvenor-rowingclub.org.uk/',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }}
                >
                  River and weather conditions
                </button>
                {isAdmin ? (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setShowNewBooking(false)
                      setEditingBooking(null)
                      setEditingTemplate(null)
                      setViewMode('pendingConfirmations')
                    }}
                  >
                    Pending confirmations ({pendingBookings.length + pendingTemplateConfirmations.length})
                  </button>
                ) : null}
                {isAdmin ? (
                  <>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setShowNewBooking(false)
                        setEditingBooking(null)
                        setEditingTemplate(null)
                        setViewMode('templates')
                        setSelectedTemplateWeekday(getWeekdayIndex(selectedDate))
                      }}
                    >
                      Edit Template
                    </button>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setShowNewBooking(false)
                        setEditingBooking(null)
                        setEditingTemplate(null)
                        setViewMode('boats')
                      }}
                    >
                      Edit boat list
                    </button>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setShowNewBooking(false)
                        setEditingBooking(null)
                        setEditingTemplate(null)
                        setViewMode('access')
                      }}
                    >
                      Manage Accesses
                    </button>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setShowNewBooking(false)
                        setEditingBooking(null)
                        setEditingTemplate(null)
                        setViewMode('riskAssessments')
                      }}
                    >
                      Risk Assessments
                    </button>
                  </>
                ) : isCoordinator ? (
                  <>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setShowNewBooking(false)
                        setEditingBooking(null)
                        setEditingTemplate(null)
                        setViewMode('access')
                      }}
                    >
                      Manage Accesses
                    </button>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setShowNewBooking(false)
                        setEditingBooking(null)
                        setEditingTemplate(null)
                        setViewMode('boats')
                      }}
                    >
                      See boat list
                    </button>
                  </>
                ) : (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setShowNewBooking(false)
                      setEditingBooking(null)
                      setEditingTemplate(null)
                      setViewMode('boats')
                    }}
                  >
                    See boat list
                  </button>
                )}
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    setShowNewBooking(false)
                    setEditingBooking(null)
                    setEditingTemplate(null)
                    setViewMode('profile')
                  }}
                >
                  Profile
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="page-pad">
        <header className="hero">
          <p className="eyebrow">
            <span>RCRC</span>
            <span>Booking Sheet</span>
          </p>
        </header>
      </div>

      {session && authView !== 'setPassword' ? (
        <main className="shell">
          <div className="page-pad schedule-top">
            {shouldShowPushPrompt ? (
              <div className="push-prompt">
                <div>
                  <strong>Enable notifications</strong>
                  <p>Turn on push notifications for booking reminders and pending confirmations.</p>
                </div>
                <div className="push-prompt-actions">
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => {
                      subscribeToPush()
                    }}
                    disabled={pushBusy}
                  >
                    {pushBusy ? 'Working...' : 'Enable notifications'}
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setPushPromptDismissed(true)}
                    disabled={pushBusy}
                  >
                    Not now
                  </button>
                </div>
              </div>
            ) : null}
            <div className="actions">
              {viewMode === 'schedule' ? (
                <div className="date-control">
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => {
                      const base = new Date(`${selectedDate}T12:00:00`)
                      base.setDate(base.getDate() - 1)
                      setSelectedDate(base.toISOString().slice(0, 10))
                    }}
                  >
                    ‹
                  </button>
                  <button
                    className="date-label date-trigger"
                    type="button"
                    onClick={() => {
                      if (datePickerRef.current?.showPicker) {
                        datePickerRef.current.showPicker()
                      } else {
                        datePickerRef.current?.focus()
                      }
                    }}
                  >
                    {formatDayLabel(selectedDate)}
                  </button>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => {
                      const base = new Date(`${selectedDate}T12:00:00`)
                      base.setDate(base.getDate() + 1)
                      setSelectedDate(base.toISOString().slice(0, 10))
                    }}
                  >
                    ›
                  </button>
                  <input
                    ref={datePickerRef}
                    className="date-hidden"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </div>
              ) : viewMode === 'templates' ? (
                <label className="field compact">
                  <span>Weekday</span>
                  <select
                    value={selectedTemplateWeekday}
                    onChange={(event) => setSelectedTemplateWeekday(Number(event.target.value))}
                  >
                    {getWeekdayOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : viewMode === 'boats' ? (
                <label className="field compact">
                  <span>Type</span>
                  <select
                    value={boatTypeFilter}
                    onChange={(event) => setBoatTypeFilter(event.target.value)}
                  >
                    <option value="">All types</option>
                    {boatTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {status || error || (!currentMember && session && !isMemberLoading) ? (
                <div className="status-inline">
                  {status ? <div className="notice success">{status}</div> : null}
                  {error ? <div className="notice error">{error}</div> : null}
                  {!currentMember && session && !isMemberLoading ? (
                    <div className="notice error">Your account is not linked to a member.</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <section
            className={`panel schedule-panel full-bleed-right ${
              viewMode === 'templates' ? 'templates-mode' : 'schedule-mode'
            }`}
          >
            {viewMode === 'pendingConfirmations' ? (
              <div className="page-pad">
                <section className="panel login-panel auth-card single">
                  <div className="auth-form">
                    <div className="panel-header">
                      <h2>
                        {isAdmin
                          ? 'Pending confirmations'
                          : pendingTemplateConfirmations.length > 0
                            ? 'Pending confirmations'
                            : 'Confirm completed bookings'}
                      </h2>
                    </div>
                    {isPendingLoading ? (
                      <p className="empty-state">Loading pending confirmations...</p>
                    ) : pendingBookings.length === 0 && pendingTemplateConfirmations.length === 0 ? (
                      <p className="empty-state">
                        {isAdmin
                          ? 'No bookings are waiting for confirmation.'
                          : 'All completed bookings have been confirmed.'}
                      </p>
                    ) : isAdmin && selectedPendingBooking ? (
                      <div className="form-grid">
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => setSelectedPendingBookingId(null)}
                        >
                          Back to pending confirmations
                        </button>
                        <div className="template-summary pending-confirmation-card">
                          <div className="template-info">
                            <strong>
                              {getRelatedType(selectedPendingBooking.boats)
                                ? `${getRelatedType(selectedPendingBooking.boats)} `
                                : ''}
                              {getRelatedName(selectedPendingBooking.boats) ?? 'Boat'}
                            </strong>
                            <span>{formatDayLabel(selectedPendingBooking.start_time.slice(0, 10))}</span>
                            <span>
                              {formatTime(selectedPendingBooking.start_time)} -{' '}
                              {formatTime(selectedPendingBooking.end_time)}
                            </span>
                            <span>
                              {getRelatedName(selectedPendingBooking.members) ?? 'Member'} booked this
                              outing.
                            </span>
                          </div>
                          <div className="modal-actions">
                            <button
                              className="button primary"
                              type="button"
                              onClick={() =>
                                handleResolvePendingBooking(selectedPendingBooking, 'confirmed')
                              }
                              disabled={pendingActionId === selectedPendingBooking.id}
                            >
                              {pendingActionId === selectedPendingBooking.id
                                ? 'Saving...'
                                : 'Outing happened'}
                            </button>
                            <button
                              className="button ghost danger"
                              type="button"
                              onClick={() =>
                                handleResolvePendingBooking(selectedPendingBooking, 'cancelled')
                              }
                              disabled={pendingActionId === selectedPendingBooking.id}
                            >
                              Did not happen
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="form-grid pending-confirmations-list">
                        {pendingTemplateConfirmations.length > 0 ? (
                          <>
                            <h3>Template bookings to confirm</h3>
                            {pendingTemplateConfirmations.map((confirmation) => {
                              const template = normalizeTemplateBooking(confirmation.booking_templates)
                              const boatName =
                                getRelatedName(template?.boats) ??
                                template?.boat_label ??
                                'Boat'
                              const boatType = getRelatedType(template?.boats)
                              const memberName =
                                getRelatedName(confirmation.members) ??
                                getRelatedName(template?.members) ??
                                'Member'
                              const busy = pendingTemplateActionId === confirmation.id
                              return (
                                <div
                                  key={confirmation.id}
                                  className="template-summary pending-confirmation-card"
                                >
                                  <div className="template-info">
                                    <strong>
                                      {boatType ? `${boatType} ` : ''}
                                      {boatName}
                                    </strong>
                                    <span>{formatDayLabel(confirmation.occurrence_date)}</span>
                                    <span>
                                      {template
                                        ? `${normalizeTime(template.start_time)} - ${normalizeTime(template.end_time)}`
                                        : 'Time unavailable'}
                                    </span>
                                    <span>
                                      {isAdmin
                                        ? `${memberName} must confirm if this template booking is still needed.`
                                        : 'Confirm if this recurring outing is still needed.'}
                                    </span>
                                  </div>
                                  <div className="modal-actions">
                                    <button
                                      className="button primary"
                                      type="button"
                                      onClick={() =>
                                        handleResolveTemplateConfirmation(
                                          confirmation,
                                          'confirmed',
                                        )
                                      }
                                      disabled={busy}
                                    >
                                      {busy ? 'Saving...' : 'Yes, keep it'}
                                    </button>
                                    <button
                                      className="button ghost danger"
                                      type="button"
                                      onClick={() =>
                                        handleResolveTemplateConfirmation(
                                          confirmation,
                                          'cancelled',
                                        )
                                      }
                                      disabled={busy}
                                    >
                                      No, remove it
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </>
                        ) : null}
                        {!isAdmin ? (
                          <p className="helper">
                            {pendingTemplateConfirmations.length > 0
                              ? 'Resolve each pending confirmation before returning to the schedule.'
                              : 'Confirm each completed booking before returning to the schedule.'}
                          </p>
                        ) : null}
                        {pendingBookings.map((booking) => {
                          const boatName = getRelatedName(booking.boats) ?? 'Boat'
                          const boatType = getRelatedType(booking.boats)
                          const memberName = getRelatedName(booking.members) ?? 'Member'
                          const busy = pendingActionId === booking.id
                          return (
                            <div
                              key={booking.id}
                              className={`template-summary pending-confirmation-card${
                                isAdmin ? ' pending-confirmation-card--clickable' : ''
                              }`}
                              onClick={() => {
                                if (isAdmin) {
                                  setSelectedPendingBookingId(booking.id)
                                }
                              }}
                              role={isAdmin ? 'button' : undefined}
                              tabIndex={isAdmin ? 0 : undefined}
                              onKeyDown={(event) => {
                                if (
                                  isAdmin &&
                                  (event.key === 'Enter' || event.key === ' ')
                                ) {
                                  event.preventDefault()
                                  setSelectedPendingBookingId(booking.id)
                                }
                              }}
                            >
                              <div className="template-info">
                                <strong>
                                  {boatType ? `${boatType} ` : ''}
                                  {boatName}
                                </strong>
                                <span>{formatDayLabel(booking.start_time.slice(0, 10))}</span>
                                <span>
                                  {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                                </span>
                                {isAdmin ? <span>{memberName} must confirm this outing.</span> : null}
                              </div>
                              {!isAdmin ? (
                                <div className="modal-actions">
                                  <button
                                    className="button primary"
                                    type="button"
                                    onClick={() => handleResolvePendingBooking(booking, 'confirmed')}
                                    disabled={busy}
                                  >
                                    {busy ? 'Saving...' : 'Outing happened'}
                                  </button>
                                  <button
                                    className="button ghost danger"
                                    type="button"
                                    onClick={() => handleResolvePendingBooking(booking, 'cancelled')}
                                    disabled={busy}
                                  >
                                    Did not happen
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : viewMode === 'riskAssessments' ? (
              <div className="access-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Coordinator</th>
                      <th>Crew type</th>
                      <th>Boat type</th>
                      <th>Booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskAssessments.map((assessment) => {
                      const linkedBookings = assessment.booking_risk_assessments ?? []
                      const firstBooking = normalizeLinkedBooking(linkedBookings[0]?.bookings)
                      const boatName = firstBooking ? getRelatedName(firstBooking.boats) ?? 'Boat' : 'Boat'
                      const memberName = firstBooking ? getRelatedName(firstBooking.members) ?? 'Member' : 'Member'
                      return (
                        <tr
                          key={assessment.id}
                          onClick={() => {
                            if (firstBooking) {
                              openRiskAssessmentEditor(firstBooking, { readOnly: true })
                            }
                          }}
                        >
                          <td>{assessment.session_date}</td>
                          <td>{assessment.session_time}</td>
                          <td>{assessment.coordinator_name}</td>
                          <td>{assessment.crew_type}</td>
                          <td>{getBoatTypeShortLabel(assessment.boat_type)}</td>
                          <td>{`${boatName} / ${memberName} (${linkedBookings.length})`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : viewMode === 'profile' ? (
              <div className="page-pad">
                <section className="panel login-panel auth-card single">
                  <div className="auth-form">
                    <div className="panel-header">
                      <h2>Profile</h2>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        <span>Name</span>
                        <input value={currentMember?.name ?? 'Unknown'} readOnly />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input value={currentMember?.email ?? session.user.email ?? ''} readOnly />
                      </label>
                      <label className="field">
                        <span>Role</span>
                        <input value={getRoleLabel(userRole)} readOnly />
                      </label>
                      {pushSupported ? (
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => {
                            if (pushEnabled) {
                              unsubscribeFromPush()
                            } else {
                              subscribeToPush()
                            }
                          }}
                          disabled={pushBusy}
                        >
                          {pushBusy
                            ? 'Working...'
                            : pushEnabled
                              ? 'Disable notifications'
                              : 'Enable notifications'}
                        </button>
                      ) : (
                        <p className="helper">
                          Push notifications are not supported in this browser.
                        </p>
                      )}
                      <button className="button ghost danger" type="button" onClick={handleLogout}>
                        Logout
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : viewMode === 'access' ? (
              <div className="access-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allowedMembers.map((member) => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.email}</td>
                        <td>
                          {member.role === 'admin'
                            ? 'Admin'
                            : member.role === 'guest'
                              ? 'Guest'
                              : 'Coordinator'}
                        </td>
                        <td>
                          {isAdmin ? (
                            <button
                              className="button ghost danger small"
                              type="button"
                              onClick={() => handleDeleteAccess(member)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : viewMode === 'boats' ? (
              <div className="boats-table">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Weight</th>
                      <th>Build Yr</th>
                      <th>Usage type</th>
                      <th>In service</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoats.map((boat) => (
                      <tr
                        key={boat.id}
                        onClick={() => {
                          if (isAdmin) {
                            openBoatEditor(boat)
                          }
                        }}
                      >
                        <td>{boat.code ?? ''}</td>
                        <td>{boat.name}</td>
                        <td>{boat.type ?? ''}</td>
                        <td>{boat.weight ?? ''}</td>
                        <td>{boat.build_year ?? ''}</td>
                        <td>{boat.usage_type ?? ''}</td>
                        <td>{boat.in_service ?? ''}</td>
                        <td>{boat.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="gantt">
                {isLoading ? (
                  <p className="empty-state">Loading schedule...</p>
                ) : (
                  <div className="gantt-scroll">
                    <div
                      className="gantt-grid"
                      style={{
                        width: ganttLayout.totalHours * HOUR_WIDTH,
                        height: ganttLayout.lanes * LANE_HEIGHT,
                      }}
                    >
                      <div className="gantt-verticals">
                        {Array.from({ length: ganttLayout.totalHours + 1 }, (_, index) => (
                          <div
                            key={`hour-${index}`}
                            className="gantt-line"
                            style={{
                              left: index * HOUR_WIDTH,
                            }}
                          />
                        ))}
                        {Array.from({ length: ganttLayout.totalHours }, (_, index) => (
                          <div
                            key={`half-${index}`}
                            className="gantt-line minor"
                            style={{
                              left: index * HOUR_WIDTH + HOUR_WIDTH / 2,
                            }}
                          />
                        ))}
                      </div>
                      <div className="gantt-hours">
                        {Array.from(
                          { length: END_HOUR - Math.ceil(START_HOUR) + 1 },
                          (_, index) => Math.ceil(START_HOUR) + index,
                        ).map((hour) => (
                          <div
                            key={hour}
                            className="gantt-hour"
                            style={{
                              left: (hour - START_HOUR) * HOUR_WIDTH,
                            }}
                          >
                            {formatHourLabel(hour)}
                          </div>
                        ))}
                      </div>
                      <div className="gantt-lanes">
                        {ganttLayout.items.map((booking) => {
                          const boatName =
                            getRelatedName(booking.boats) ??
                            (booking.isTemplate ? booking.boat_label ?? 'Boat' : 'Boat')
                          const boatType = getRelatedType(booking.boats)
                          const memberName =
                            getRelatedName(booking.members) ??
                            (booking.isTemplate ? booking.member_label ?? 'Member' : 'Member')
                          const left = (booking.startMinutes / 60) * HOUR_WIDTH
                          const width = Math.max(
                            36,
                            ((booking.endMinutes - booking.startMinutes) / 60) * HOUR_WIDTH,
                          )
                          const canOpenTemplate =
                            viewMode === 'templates'
                              ? isAdmin
                              : Boolean(
                                  booking.boat_id &&
                                    booking.templateId &&
                                    canEditTemplate(booking),
                                )
                          const canOpenBooking = booking.isTemplate
                            ? canOpenTemplate
                            : canEditBooking(booking as Booking)
                          const isPastRenderedBooking =
                            !booking.isTemplate && isPastBooking(booking as Booking)
                          const isPendingRenderedBooking =
                            !booking.isTemplate && isPendingBooking(booking as Booking)
                          const isSettledRenderedBooking =
                            !booking.isTemplate && isSettledBooking(booking as Booking)
                          const handleBookingClick = () => {
                            if (!canOpenBooking) {
                              return
                            }
                            if (booking.isTemplate) {
                              if (viewMode === 'templates') {
                                setEditingTemplate(booking)
                                setEditingBooking(null)
                                setShowNewBooking(false)
                                setBookingBoatId(booking.boat_id ?? '')
                                setBookingBoatIds([])
                                setBoatSearch('')
                                setBookingMemberId(booking.member_id ?? '')
                                setStartTime(formatTimeInput(booking.start_time))
                                setEndTime(formatTimeInput(booking.end_time))
                                if (typeof booking.weekday === 'number') {
                                  setSelectedTemplateWeekday(booking.weekday)
                                }
                                return
                              }
                              setEditingTemplate(booking)
                              setEditingBooking(null)
                              setShowNewBooking(false)
                              return
                            }
                            setEditingBooking(booking as Booking)
                            setEditingTemplate(null)
                            setShowNewBooking(false)
                            setBookingBoatId(booking.boat_id ?? '')
                            setBookingBoatIds([])
                            setBoatSearch('')
                            setBookingMemberId(booking.member_id ?? '')
                            setStartTime(formatTimeInput(booking.start_time))
                            setEndTime(formatTimeInput(booking.end_time))
                          }
                          return (
                            <button
                              key={booking.id}
                              type="button"
                              className={`booking-pill gantt-pill${
                                booking.isTemplate ? ' template' : ''
                              }${
                                (isSettledRenderedBooking ||
                                  (isPastRenderedBooking && !isPendingRenderedBooking)) &&
                                !isPendingRenderedBooking
                                  ? ' booking-pill--past'
                                  : ''
                              }${
                                isPendingRenderedBooking ? ' booking-pill--pending' : ''
                              }`}
                              style={{
                                transform: `translate(${left}px, ${booking.lane * LANE_HEIGHT}px)`,
                                width,
                              }}
                              onClick={handleBookingClick}
                              disabled={!canOpenBooking}
                              aria-disabled={!canOpenBooking}
                            >
                              <div>
                                <strong>{boatType ? `${boatType} ${boatName}` : boatName}</strong>
                                <span>{memberName}</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="shell auth-shell">
          {status || error ? (
            <div className="auth-status">
              <div className="status-inline">
                {status ? <div className="notice success">{status}</div> : null}
                {error ? <div className="notice error">{error}</div> : null}
              </div>
            </div>
          ) : null}
          <section className="panel login-panel auth-card single">
            <div className="auth-form">
              <div className="panel-header">
                <h2>
                  {authView === 'setPassword'
                    ? 'Reset password'
                    : authView === 'signup'
                      ? 'Sign up'
                      : authView === 'recovery'
                        ? 'Forgot password'
                        : 'Sign in'}
                </h2>
              </div>
              {authView === 'setPassword' ? (
                <div className="form-grid">
                  <label className="field">
                    <span>New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </label>
                  <button className="button primary" type="button" onClick={handleSetPassword}>
                    {isAuthBusy ? 'Saving...' : 'Set password'}
                  </button>
                </div>
              ) : authView === 'signup' ? (
                <div className="form-grid">
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(event) => setSignupEmail(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Create password</span>
                    <input
                      type="password"
                      value={signupPassword}
                      onChange={(event) => setSignupPassword(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={signupConfirm}
                      onChange={(event) => setSignupConfirm(event.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    onClick={handleSignUp}
                    disabled={isSendingEmail}
                  >
                    {isSendingEmail ? 'Sending email...' : 'Send verification email'}
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setAuthView('signin')}
                  >
                    Back to sign in
                  </button>
                </div>
              ) : authView === 'recovery' ? (
                <div className="form-grid">
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={isAuthBusy}
                  >
                    {isAuthBusy ? 'Sending email...' : 'Send reset email'}
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setAuthView('signin')}
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <div className="form-grid">
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    onClick={handlePasswordLogin}
                    disabled={isAuthBusy}
                  >
                    {isAuthBusy ? 'Signing in...' : 'Sign in'}
                  </button>
                  <div className="auth-links">
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setAuthView('signup')}
                    >
                      Create an account
                    </button>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setAuthView('recovery')}
                    >
                      Forgot password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {session &&
      (isAdmin || (currentMember && !isGuest)) &&
      !showNewBooking &&
      !editingBooking &&
      !editingTemplate &&
      viewMode !== 'boats' &&
      viewMode !== 'access' &&
      viewMode !== 'profile' &&
      viewMode !== 'riskAssessments' &&
      viewMode !== 'pendingConfirmations' &&
      (viewMode !== 'schedule' || !isSelectedDateInPast)
        ? createPortal(
            <button
              className="fab"
              onClick={() => {
                skipBackdropClick.current = true
                setEditingBooking(null)
                setEditingTemplate(null)
                setShowNewBooking(true)
                refreshBoatAccess()
                if (viewMode === 'templates') {
                  setBookingBoatId('')
                  setBookingMemberId('')
                  setStartTime('07:30')
                  setEndTime('08:30')
                } else if (viewMode === 'schedule' && currentMember && !isAdmin) {
                  setBookingMemberId(currentMember.id)
                }
                setBookingBoatIds([])
                setBoatSearch('')
                setTimeout(() => {
                  skipBackdropClick.current = false
                }, 0)
              }}
              aria-label="New booking"
              type="button"
            >
              +
            </button>,
            document.body,
          )
        : null}

      {session && (showNewBooking || editingBooking || editingTemplate) ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (skipBackdropClick.current) {
              return
            }
            resetBookingForm()
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingTemplate && viewMode === 'templates'
                  ? 'Edit template'
                  : editingTemplate
                    ? 'Template booking'
                    : editingBooking
                      ? isPastBooking(editingBooking)
                        ? 'View booking'
                        : 'Edit booking'
                      : viewMode === 'templates'
                        ? 'New template booking'
                        : 'New booking'}
              </h3>
              <button className="button ghost" onClick={resetBookingForm}>
                Close
              </button>
            </div>
            {editingTemplate && viewMode !== 'templates' ? (
              <>
                <div className="template-summary">
                  <div className="template-info">
                    <strong>
                      {getRelatedType(editingTemplate.boats)
                        ? `${getRelatedType(editingTemplate.boats)} `
                        : ''}
                      {getRelatedName(editingTemplate.boats) ??
                        editingTemplate.boat_label ??
                        'Boat'}
                    </strong>
                    <span>
                      {getRelatedName(editingTemplate.members) ??
                        editingTemplate.member_label ??
                        'Member'}
                    </span>
                  </div>
                  <span className="booking-time">
                    {formatTime(editingTemplate.start_time)} -{' '}
                    {formatTime(editingTemplate.end_time)}
                  </span>
                </div>
                <button
                  className="button primary"
                  onClick={handleConfirmTemplateBooking}
                  disabled={pendingTemplateActionId === editingTemplate.templateId}
                >
                  {pendingTemplateActionId === editingTemplate.templateId
                    ? 'Confirming...'
                    : 'Confirm the booking'}
                </button>
                <button className="button ghost danger" onClick={handleDeleteTemplate}>
                  Skip for this date
                </button>
              </>
            ) : viewMode === 'templates' ? (
              <>
                <div className="form-grid">
                  {isAdmin ? (
                    <label className="field">
                      <span>Member</span>
                      <select
                        value={bookingMemberId}
                        onChange={(event) => setBookingMemberId(event.target.value)}
                        disabled={isEditingBookingLocked}
                      >
                        <option value="">Select a member</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="field">
                      <span>Member</span>
                      <input value={currentMember?.name ?? ''} readOnly />
                    </label>
                  )}
                  <label className="field">
                    <span>Boat (optional)</span>
                    <select
                      value={bookingBoatId}
                      onChange={(event) => setBookingBoatId(event.target.value)}
                    >
                      <option value="">Generic / no boat</option>
                      {boats.map((boat) => (
                        <option key={boat.id} value={boat.id}>
                          {boat.type ? `${boat.type} ${boat.name}` : boat.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Start time</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>End time</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </label>
                  <button className="button primary" onClick={handleSaveTemplate}>
                    {editingTemplate ? 'Save template' : 'Create template'}
                  </button>
                  {editingTemplate ? (
                    <button className="button ghost danger" onClick={handleDeleteTemplateRow}>
                      Delete template
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="form-grid">
                  {editingBooking ? (
                    <p className="helper">{getBookingUsageLabel(editingBooking)}</p>
                  ) : null}
                  {isAdmin ? (
                    <label className="field">
                      <span>Member</span>
                      <select
                        value={bookingMemberId}
                        onChange={(event) => setBookingMemberId(event.target.value)}
                      >
                        <option value="">Select a member</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="field">
                      <span>Member</span>
                      <input value={currentMember?.name ?? ''} readOnly />
                    </label>
                  )}
                  {editingBooking ? (
                    <label className="field">
                      <span>Boat</span>
                      <select
                        value={bookingBoatId}
                        onChange={(event) => setBookingBoatId(event.target.value)}
                        disabled={isEditingBookingLocked}
                        onFocus={refreshBoatAccess}
                      >
                        <option value="">Select a boat</option>
                        {(isAdmin ? boats : allowedBoats).map((boat) => (
                          <option key={boat.id} value={boat.id}>
                            {boat.type ? `${boat.type} ${boat.name}` : boat.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="field">
                      <span>Boats</span>
                      <input
                        type="text"
                        placeholder="Search boat type or name"
                        value={boatSearch}
                        onChange={(event) => setBoatSearch(event.target.value)}
                        disabled={isEditingBookingLocked}
                        onFocus={refreshBoatAccess}
                      />
                      <div className="boat-chips">
                        {bookingBoatIds.length === 0 ? (
                          <span className="chip muted">No boats selected</span>
                        ) : (
                          bookingBoatIds.map((id) => {
                            const boat = bookingBoatsSource.find((item) => item.id === id)
                            const label = boat
                              ? boat.type
                                ? `${boat.type} ${boat.name}`
                                : boat.name
                              : id
                            return (
                              <button
                                key={id}
                                type="button"
                                className="chip"
                                onClick={() =>
                                  setBookingBoatIds((prev) =>
                                    prev.filter((item) => item !== id),
                                  )
                                }
                              >
                                {label} ✕
                              </button>
                            )
                          })
                        )}
                      </div>
                      <div className="boat-list">
                        {filteredBookingBoats.map((boat) => {
                          const label = boat.type ? `${boat.type} ${boat.name}` : boat.name
                          const checked = bookingBoatIds.includes(boat.id)
                          return (
                            <label key={boat.id} className="boat-option">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isEditingBookingLocked}
                                onChange={(event) => {
                                  const next = event.target.checked
                                  setBookingBoatIds((prev) =>
                                    next ? [...prev, boat.id] : prev.filter((id) => id !== boat.id),
                                  )
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <label className="field">
                    <span>Start time</span>
                    <input
                      type="time"
                      value={startTime}
                      min="07:30"
                      disabled={isEditingBookingLocked}
                      onChange={(event) => {
                        const nextStart = event.target.value
                        setStartTime(nextStart)
                        if (nextStart) {
                          const base = new Date(`2000-01-01T${nextStart}:00`)
                          base.setHours(base.getHours() + 1)
                          const nextEnd = `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`
                          setEndTime(nextEnd)
                        }
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>End time</span>
                    <input
                      type="time"
                      value={endTime}
                      min="07:30"
                      disabled={isEditingBookingLocked}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </label>
                  {!isEditingBookingLocked ? (
                    <>
                      <button className="button primary" onClick={handleSaveBooking}>
                        {editingBooking ? 'Save changes' : 'Validate booking'}
                      </button>
                      {editingBooking ? (
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => openRiskAssessmentEditor(editingBooking)}
                          disabled={!canOpenRiskAssessment(editingBooking)}
                          title={
                            canOpenRiskAssessment(editingBooking)
                              ? undefined
                              : getRiskAssessmentAvailabilityMessage(editingBooking)
                          }
                        >
                          Create / Link Risk Assessment
                        </button>
                      ) : null}
                      {editingBooking ? (
                        <button className="button ghost danger" onClick={handleDeleteBooking}>
                          Delete booking
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
                {isEditingBookingLocked ? (
                  <p className="helper">
                    Past bookings and bookings waiting for confirmation are read-only.
                  </p>
                ) : null}
                {isEditingBookingLocked && editingBooking && bookingHasLinkedRiskAssessment ? (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => openRiskAssessmentEditor(editingBooking, { readOnly: true })}
                  >
                    Risk Assessment
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {session && riskAssessmentBooking ? (
        <div className="modal-backdrop" onClick={resetRiskAssessmentForm}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {riskAssessmentReadOnly
                  ? 'View Risk Assessment'
                  : linkedRiskAssessment
                    ? 'Edit Linked Risk Assessment'
                  : editingRiskAssessment
                    ? 'Edit Risk Assessment'
                    : 'Create Risk Assessment'}
              </h3>
              <button className="button ghost" type="button" onClick={resetRiskAssessmentForm}>
                Close
              </button>
            </div>
            {isRiskAssessmentLoading ? (
              <p className="empty-state">Loading risk assessment...</p>
            ) : (
              <div className="form-grid">
                {!riskAssessmentReadOnly && !linkedRiskAssessment && availableRiskAssessments.length > 0 ? (
                  <div className="field">
                    <span>Existing risk assessments for this time slot</span>
                    <div className="boat-list">
                      {availableRiskAssessments.map((assessment) => (
                        <button
                          key={assessment.id}
                          className="button ghost"
                          type="button"
                          onClick={() => handleLinkExistingRiskAssessment(assessment)}
                        >
                          {assessment.coordinator_name} - {assessment.session_date} {assessment.session_time}
                        </button>
                      ))}
                    </div>
                    <p className="helper">
                      You can link one of these existing assessments instead of creating a new one.
                    </p>
                  </div>
                ) : null}
                <label className="field">
                  <span>Coach/Crew Coordinator Name</span>
                  <input
                    value={riskAssessmentForm.coordinator_name}
                    readOnly={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        coordinator_name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Date of Session</span>
                  <input
                    type="date"
                    value={riskAssessmentForm.session_date}
                    readOnly={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        session_date: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Time of Session</span>
                  <input
                    type="time"
                    value={riskAssessmentForm.session_time}
                    readOnly={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        session_time: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Type of crew which is going out</span>
                  <select
                    value={riskAssessmentForm.crew_type}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({ ...prev, crew_type: event.target.value }))
                    }
                  >
                    <option value="">Select</option>
                    {CREW_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Type of boats going out</span>
                  <select
                    value={riskAssessmentForm.boat_type}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({ ...prev, boat_type: event.target.value }))
                    }
                  >
                    <option value="">Select</option>
                    {BOAT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Will the boats be followed by a launch</span>
                  <select
                    value={riskAssessmentForm.launch_supervision}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        launch_supervision: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select</option>
                    {LAUNCH_SUPERVISION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Visibility</span>
                  <select
                    value={riskAssessmentForm.visibility}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({ ...prev, visibility: event.target.value }))
                    }
                  >
                    <option value="">Select</option>
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>River level at Ironbridge</span>
                  <select
                    value={riskAssessmentForm.river_level}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({ ...prev, river_level: event.target.value }))
                    }
                  >
                    <option value="">Select</option>
                    {RIVER_LEVEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Subjective assessment of water conditions at time of boating</span>
                  <select
                    value={riskAssessmentForm.water_conditions}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        water_conditions: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select</option>
                    {WATER_CONDITION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Air Temperature</span>
                  <select
                    value={riskAssessmentForm.air_temperature}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        air_temperature: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select</option>
                    {AIR_TEMPERATURE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Wind Conditions</span>
                  <select
                    value={riskAssessmentForm.wind_conditions}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        wind_conditions: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select</option>
                    {WIND_CONDITION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Actions taken to reduce risks identified above</span>
                  <textarea
                    value={riskAssessmentForm.risk_actions}
                    readOnly={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        risk_actions: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Is there an incoming tide whilst you are due to be out?</span>
                  <select
                    value={riskAssessmentForm.incoming_tide}
                    disabled={riskAssessmentReadOnly}
                    onChange={(event) =>
                      setRiskAssessmentForm((prev) => ({
                        ...prev,
                        incoming_tide: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select</option>
                    {INCOMING_TIDE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                {!riskAssessmentReadOnly ? (
                  <button className="button primary" type="button" onClick={handleSaveRiskAssessment}>
                    {linkedRiskAssessment || editingRiskAssessment
                      ? 'Save Risk Assessment'
                      : 'Create New Risk Assessment'}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {session && editingBoat ? (
        <div className="modal-backdrop" onClick={() => setEditingBoat(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit boat</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Code</span>
                <input
                  value={boatForm.code}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={boatForm.name}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Type</span>
                <input
                  value={boatForm.type}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, type: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Weight</span>
                <input
                  value={boatForm.weight}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, weight: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Build Yr</span>
                <input
                  value={boatForm.build_year}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, build_year: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Usage type</span>
                <select
                  value={boatForm.usage_type}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, usage_type: event.target.value }))
                  }
                >
                  <option value="">Select usage type</option>
                  <option value="Captains permission">Captains permission</option>
                  <option value="Restricted">Restricted</option>
                  <option value="General use">General use</option>
                </select>
              </label>
              <label className="field">
                <span>In service</span>
                <select
                  value={boatForm.in_service}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, in_service: event.target.value }))
                  }
                >
                  <option value="">Select status</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
              <label className="field">
                <span>Notes</span>
                <input
                  value={boatForm.notes}
                  onChange={(event) =>
                    setBoatForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </label>
              {(boatForm.usage_type || '').toLowerCase() === 'captains permission' ? (
                <div className="field">
                  <span>Allowed members</span>
                  <div className="permission-controls">
                    <select
                      value={selectedPermissionMemberId}
                      onChange={(event) => setSelectedPermissionMemberId(event.target.value)}
                    >
                      <option value="">Select a member</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button ghost small"
                      type="button"
                      onClick={() => {
                        if (!selectedPermissionMemberId) {
                          return
                        }
                        if (!boatPermissionIds.includes(selectedPermissionMemberId)) {
                          setBoatPermissionIds((prev) => [...prev, selectedPermissionMemberId])
                        }
                      }}
                    >
                      Add
                    </button>
                    <button
                      className="button ghost small"
                      type="button"
                      onClick={() => {
                        if (!selectedPermissionMemberId) {
                          return
                        }
                        setBoatPermissionIds((prev) =>
                          prev.filter((id) => id !== selectedPermissionMemberId),
                        )
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    className="permission-list"
                    readOnly
                    value={boatPermissionIds
                      .map((id) => members.find((member) => member.id === id)?.name)
                      .filter(Boolean)
                      .join('\n')}
                    placeholder="No members selected"
                  />
                </div>
              ) : null}
            </div>
            <div className="modal-actions">
              <button className="button primary" onClick={handleSaveBoat}>
                Save
              </button>
              <button className="button ghost" onClick={() => setEditingBoat(null)}>
                Cancel
              </button>
            </div>
            <button className="button ghost danger delete-row" onClick={handleDeleteBoat}>
              Delete boat
            </button>
          </div>
        </div>
      ) : null}

      {session && showAccessEditor ? (
        <div className="modal-backdrop" onClick={() => setShowAccessEditor(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Add access</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input
                  value={accessForm.name}
                  onChange={(event) =>
                    setAccessForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={accessForm.email}
                  onChange={(event) =>
                    setAccessForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Role</span>
                <select
                  value={accessForm.role}
                  onChange={(event) =>
                    setAccessForm((prev) => ({
                      ...prev,
                      role: event.target.value as UserRole,
                    }))
                  }
                >
                  {isAdmin ? (
                    <>
                      <option value="coordinator">Coordinator</option>
                      <option value="guest">Guest</option>
                      <option value="admin">Admin</option>
                    </>
                  ) : (
                    <option value="guest">Guest</option>
                  )}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="button primary" onClick={handleSaveAccess}>
                Add
              </button>
              <button className="button ghost" onClick={() => setShowAccessEditor(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {session &&
      !showNewBooking &&
      !editingBooking &&
      !editingTemplate &&
      !editingBoat &&
      viewMode === 'boats' &&
      isAdmin
        ? createPortal(
            <button
              className="fab"
              onClick={() => openBoatEditor()}
              aria-label="New boat"
              type="button"
            >
              +
            </button>,
            document.body,
          )
        : null}

      {session &&
      !showNewBooking &&
      !editingBooking &&
      !editingTemplate &&
      !editingBoat &&
      viewMode === 'access' &&
      canManageAccess
        ? createPortal(
            <button
              className="fab"
              onClick={() => {
                setShowAccessEditor(true)
                setAccessForm({
                  email: '',
                  name: '',
                  role: isCoordinator ? 'guest' : 'coordinator',
                })
              }}
              aria-label="New access"
              type="button"
            >
              +
            </button>,
            document.body,
          )
        : null}
    </div>
  )
}

export default App
