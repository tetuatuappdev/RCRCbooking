import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

const START_HOUR = 7.5
const END_HOUR = 20
const HOUR_WIDTH = 180
const LANE_HEIGHT = 64

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
  boats?: { name: string; type?: string | null } | { name: string; type?: string | null }[] | null
  members?: { name: string } | { name: string }[] | null
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

type BoatPermission = {
  boat_id: string
  member_id: string
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminFromAllowlist, setAdminFromAllowlist] = useState<boolean | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allowedMembers, setAllowedMembers] = useState<
    { id: string; email: string; name: string; is_admin: boolean }[]
  >([])
  const [boats, setBoats] = useState<Boat[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
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
  const [viewMode, setViewMode] = useState<'schedule' | 'templates' | 'boats' | 'access'>(
    'schedule',
  )

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
  const [pushTestBusy, setPushTestBusy] = useState(false)
  const [showAccessEditor, setShowAccessEditor] = useState(false)
  const [accessForm, setAccessForm] = useState({
    email: '',
    name: '',
    is_admin: false,
  })

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
    const sessionEmail = session?.user?.email
    if (!sessionEmail) {
      setCurrentMember(null)
      setIsAdmin(false)
      setAdminFromAllowlist(null)
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
        .select('email, name, is_admin')
        .ilike('email', sessionEmail)
        .maybeSingle()

      if (allowedError) {
        setError(allowedError.message)
        setIsMemberLoading(false)
        return
      }

      if (!allowed) {
        setCurrentMember(null)
        setError('Your email is not authorized.')
        await supabase.auth.signOut({ scope: 'local' })
        setAuthView('signin')
        setIsMemberLoading(false)
        return
      }
      setAdminFromAllowlist(allowed.is_admin)
      setIsAdmin(allowed.is_admin)

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

      if (allowed.is_admin) {
        await supabase.from('admins').insert({ member_id: createdMember.id })
      }
      setIsMemberLoading(false)
    }

    loadCurrentMember()
  }, [fetchMembers, session])

  useEffect(() => {
    if (!currentMember) {
      setIsAdmin(false)
      return
    }

    if (adminFromAllowlist !== null) {
      setIsAdmin(adminFromAllowlist)
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

      setIsAdmin(Boolean(data))
    }

    loadAdminStatus()
  }, [adminFromAllowlist, currentMember])

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
      .select('id, email, name, is_admin')
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setAllowedMembers(data ?? [])
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
    fetchBoatPermissions()
  }, [fetchBoatPermissions])

  useEffect(() => {
    if (viewMode === 'access' && isAdmin) {
      fetchAllowedMembers()
    }
  }, [fetchAllowedMembers, isAdmin, viewMode])

  useEffect(() => {
    if (!isAdmin && (viewMode === 'templates' || viewMode === 'access')) {
      setViewMode('schedule')
    }
  }, [isAdmin, viewMode])

  useEffect(() => {
    if (currentMember && !isAdmin && viewMode === 'schedule') {
      setBookingMemberId(currentMember.id)
    }
  }, [currentMember, isAdmin, viewMode])

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
          .select('id, boat_id, member_id, start_time, end_time, boats(name,type), members(name)')
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
      .filter((template) => viewMode === 'templates' || !excludedTemplateIds.has(template.id))
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
    }))

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
    if (isAdmin) {
      return true
    }
    return Boolean(currentMember && booking.member_id === currentMember.id)
  }

  const canEditTemplate = (item: { member_id: string | null }) => {
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

  const notifyBookingCreated = useCallback(
    async (bookingIds: string[]) => {
      if (bookingIds.length === 0) {
        return
      }
      try {
        const token = await getAccessToken()
        if (!token) {
          return
        }
        await fetch('/api/push/notify-booking', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ bookingIds }),
        })
      } catch {
        // Ignore notification errors.
      }
    },
    [getAccessToken],
  )

  const sendTestPush = useCallback(async () => {
    setPushTestBusy(true)
    setError(null)
    setStatus(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('You must be signed in to send a test notification.')
        return
      }

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; sent?: number }
        | null

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send test notification.')
      }

      setStatus(
        typeof payload?.sent === 'number'
          ? `Test notification sent (${payload.sent}).`
          : 'Test notification sent.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test notification.')
    } finally {
      setPushTestBusy(false)
    }
  }, [getAccessToken])

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

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError('Enter a valid start and end time.')
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
      const { data: inserted, error: insertError } = await supabase
        .from('bookings')
        .insert(inserts)
        .select('id')

      if (insertError) {
        setError(insertError.message)
        return
      }
      setStatus(inserts.length > 1 ? 'Bookings confirmed!' : 'Booking confirmed!')
      if (inserted && inserted.length > 0) {
        notifyBookingCreated(inserted.map((row) => row.id))
      }
    }

    resetBookingForm()

    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data } = await supabase
      .from('bookings')
      .select('id, boat_id, member_id, start_time, end_time, boats(name,type), members(name)')
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

    if (!canEditBooking(editingBooking)) {
      setError('You can only delete your own bookings.')
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
      .select('id, boat_id, member_id, start_time, end_time, boats(name,type), members(name)')
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

  const handleSaveAccess = async () => {
    setError(null)
    setStatus(null)

    const email = accessForm.email.trim().toLowerCase()
    const name = accessForm.name.trim()
    if (!email || !name) {
      setError('Enter a name and email.')
      return
    }

    const { error } = await supabase.from('allowed_member').insert({
      email,
      name,
      is_admin: accessForm.is_admin,
    })

    if (error) {
      setError(error.message)
      return
    }

    setStatus('Access added.')
    setAccessForm({ email: '', name: '', is_admin: false })
    setShowAccessEditor(false)
    fetchAllowedMembers()
  }

  const handleDeleteAccess = async (member: { email: string }) => {
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
      {session ? (
        <div className="header-menu">
          <button
            className="menu-button"
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
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
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    window.open(
                      'https://forms.office.com/pages/responsepage.aspx?id=-IfL4Xjbd0-GJ9xSeeWF3QcM_q2QJTNIkImQlQ8ffo1UOUg4VFRLM0xMNU9YQ0xZQTdZMUdGOUk2SC4u&route=shorturl',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }}
                >
                  Outing Risk Assessment
                </button>
                {pushSupported ? (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false)
                      if (pushEnabled) {
                        unsubscribeFromPush()
                      } else {
                        subscribeToPush()
                      }
                    }}
                  >
                    {pushBusy
                      ? 'Working...'
                      : pushEnabled
                        ? 'Disable notifications'
                        : 'Enable notifications'}
                  </button>
                ) : null}
                {pushSupported && pushEnabled ? (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false)
                      sendTestPush()
                    }}
                    disabled={pushTestBusy}
                  >
                    {pushTestBusy ? 'Sending test...' : 'Send test notification'}
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
                    handleLogout()
                  }}
                >
                  Logout
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
            {viewMode === 'access' ? (
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
                        <td>{member.is_admin ? 'Admin' : 'Member'}</td>
                        <td>
                          <button
                            className="button ghost danger small"
                            type="button"
                            onClick={() => handleDeleteAccess(member)}
                          >
                            Remove
                          </button>
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
      (isAdmin || currentMember) &&
      !showNewBooking &&
      !editingBooking &&
      !editingTemplate &&
      viewMode !== 'boats' &&
      viewMode !== 'access'
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
                      ? 'Edit booking'
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
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </label>
                  <button className="button primary" onClick={handleSaveBooking}>
                    {editingBooking ? 'Save changes' : 'Validate booking'}
                  </button>
                  {editingBooking ? (
                    <button className="button ghost danger" onClick={handleDeleteBooking}>
                      Delete booking
                    </button>
                  ) : null}
                </div>
                <p className="helper">Booking will be checked against existing reservations.</p>
              </>
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
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={accessForm.is_admin}
                  onChange={(event) =>
                    setAccessForm((prev) => ({ ...prev, is_admin: event.target.checked }))
                  }
                />
                <span>Admin access</span>
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
      isAdmin
        ? createPortal(
            <button
              className="fab"
              onClick={() => {
                setShowAccessEditor(true)
                setAccessForm({ email: '', name: '', is_admin: false })
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
