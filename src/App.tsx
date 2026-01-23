import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

const HOURS = Array.from({ length: 16 }, (_, index) => index + 6)

type Member = {
  id: string
  name: string
  email: string
}

type Boat = {
  id: string
  name: string
  type: string | null
}

type Booking = {
  id: string
  boat_id: string
  member_id: string | null
  start_time: string
  end_time: string
  boats?: {
    name: string
  } | null
  members?: {
    name: string
  } | null
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

const formatDisplayDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

const toDateTime = (date: string, time: string) => new Date(`${date}T${time}:00`)

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [boats, setBoats] = useState<Boat[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [currentMember, setCurrentMember] = useState<Member | null>(null)

  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [selectedDate, setSelectedDate] = useState(getTodayString)

  const [showNewBooking, setShowNewBooking] = useState(false)
  const [bookingBoatId, setBookingBoatId] = useState('')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('08:00')

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)

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
    const loadMembers = async () => {
      const { data, error: membersError } = await supabase
        .from('members')
        .select('id, name, email')
        .order('name', { ascending: true })

      if (membersError) {
        setError(membersError.message)
        return
      }

      setMembers(data ?? [])
    }

    loadMembers()
  }, [])

  useEffect(() => {
    if (!session?.user?.email) {
      setCurrentMember(null)
      return
    }

    const loadCurrentMember = async () => {
      const { data, error: memberError } = await supabase
        .from('members')
        .select('id, name, email')
        .eq('email', session.user.email)
        .maybeSingle()

      if (memberError) {
        setError(memberError.message)
        return
      }

      setCurrentMember(data ?? null)
    }

    loadCurrentMember()
  }, [session])

  useEffect(() => {
    if (!session) {
      setBoats([])
      setBookings([])
      return
    }

    const loadBoats = async () => {
      const { data, error: boatsError } = await supabase
        .from('boats')
        .select('id, name, type')
        .order('type', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })

      if (boatsError) {
        setError(boatsError.message)
        return
      }

      setBoats(data ?? [])
    }

    loadBoats()
  }, [session])

  useEffect(() => {
    if (!session) {
      return
    }

    const loadBookings = async () => {
      const dayStart = new Date(`${selectedDate}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      setIsLoading(true)
      const { data, error: bookingError } = await supabase
        .from('bookings')
        .select('id, boat_id, member_id, start_time, end_time, boats(name), members(name)')
        .lt('start_time', dayEnd.toISOString())
        .gt('end_time', dayStart.toISOString())
        .order('start_time', { ascending: true })

      setIsLoading(false)

      if (bookingError) {
        setError(bookingError.message)
        return
      }

      setBookings(data ?? [])
    }

    loadBookings()
  }, [selectedDate, session])

  const hourlySchedule = useMemo(() => {
    return HOURS.map((hour) => {
      const start = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:00:00`)
      const end = new Date(start)
      end.setHours(end.getHours() + 1)

      const items = bookings.filter((booking) => {
        const bookingStart = new Date(booking.start_time)
        const bookingEnd = new Date(booking.end_time)
        return bookingStart < end && bookingEnd > start
      })

      return { hour, items }
    })
  }, [bookings, selectedDate])

  const handleSendLogin = async () => {
    setError(null)
    setStatus(null)

    const selectedMember = members.find((member) => member.id === selectedMemberId)
    if (!selectedMember) {
      setError('Select your name to request a login email.')
      return
    }

    setIsSendingEmail(true)
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email: selectedMember.email,
      options: {
        emailRedirectTo:
          import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() || window.location.origin,
      },
    })
    setIsSendingEmail(false)

    if (loginError) {
      setError(loginError.message)
      return
    }

    setStatus(`Login email sent to ${selectedMember.email}. Check your inbox.`)
  }

  const handleCreateBooking = async () => {
    setError(null)
    setStatus(null)

    if (!currentMember) {
      setError('Your email does not match any club member yet.')
      return
    }

    if (!bookingBoatId) {
      setError('Select a boat for the booking.')
      return
    }

    const startDate = toDateTime(selectedDate, startTime)
    const endDate = toDateTime(selectedDate, endTime)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError('Enter a valid start and end time.')
      return
    }

    if (endDate <= startDate) {
      setError('End time must be after start time.')
      return
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from('bookings')
      .select('id')
      .eq('boat_id', bookingBoatId)
      .lt('start_time', endDate.toISOString())
      .gt('end_time', startDate.toISOString())

    if (conflictError) {
      setError(conflictError.message)
      return
    }

    if (conflicts && conflicts.length > 0) {
      setError('That boat is already booked for the selected time.')
      return
    }

    const { error: insertError } = await supabase.from('bookings').insert({
      boat_id: bookingBoatId,
      member_id: currentMember.id,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setStatus('Booking confirmed!')
    setShowNewBooking(false)

    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data } = await supabase
      .from('bookings')
      .select('id, boat_id, member_id, start_time, end_time, boats(name), members(name)')
      .lt('start_time', dayEnd.toISOString())
      .gt('end_time', dayStart.toISOString())
      .order('start_time', { ascending: true })

    setBookings(data ?? [])
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setStatus('Logged out.')
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">RCRC Boat Booking</p>
          <h1>Reserve the right boat, without the spreadsheet chaos.</h1>
          <p className="lede">
            Request a magic login link, pick a day, and keep the water time flowing.
          </p>
        </div>
        {session ? (
          <div className="user-card">
            <div>
              <p className="user-label">Logged in as</p>
              <p className="user-name">{currentMember?.name ?? session.user.email}</p>
            </div>
            <button className="button ghost" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <main className="shell">
        {!session ? (
          <section className="panel login-panel">
            <div className="panel-header">
              <h2>Login link</h2>
              <p>Choose your name, then receive a secure email link.</p>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Member</span>
                <select
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                >
                  <option value="">Select your name</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                onClick={handleSendLogin}
                disabled={isSendingEmail}
              >
                {isSendingEmail ? 'Sending email...' : 'Send login email'}
              </button>
            </div>
            {members.length === 0 ? (
              <p className="empty-state">
                No members found. Add members in Supabase to enable login.
              </p>
            ) : null}
          </section>
        ) : (
          <section className="panel schedule-panel">
            <div className="panel-header">
              <div>
                <h2>Daily schedule</h2>
                <p>{formatDisplayDate(selectedDate)}</p>
              </div>
              <div className="actions">
                <label className="field compact">
                  <span>Day</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
                <button
                  className="button primary"
                  onClick={() => setShowNewBooking(true)}
                >
                  + New booking
                </button>
              </div>
            </div>

            <div className="schedule">
              {isLoading ? (
                <p className="empty-state">Loading schedule...</p>
              ) : (
                hourlySchedule.map(({ hour, items }) => (
                  <div key={hour} className="schedule-row">
                    <div className="schedule-hour">
                      {String(hour).padStart(2, '0')}:00
                    </div>
                    <div className="schedule-items">
                      {items.length === 0 ? (
                        <span className="slot-empty">Free</span>
                      ) : (
                        items.map((booking) => (
                          <div key={booking.id} className="booking-pill">
                            <div>
                              <strong>{booking.boats?.name ?? 'Boat'}</strong>
                              <span>{booking.members?.name ?? 'Member'}</span>
                            </div>
                            <span className="booking-time">
                              {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {status ? <div className="notice success">{status}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
      </main>

      {showNewBooking ? (
        <div className="modal-backdrop" onClick={() => setShowNewBooking(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>New booking</h3>
              <button className="button ghost" onClick={() => setShowNewBooking(false)}>
                Close
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Boat</span>
                <select
                  value={bookingBoatId}
                  onChange={(event) => setBookingBoatId(event.target.value)}
                >
                  <option value="">Select a boat</option>
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
              <button className="button primary" onClick={handleCreateBooking}>
                Validate booking
              </button>
            </div>
            <p className="helper">Booking will be checked against existing reservations.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
