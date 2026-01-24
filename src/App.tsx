import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

function App() {
  const [members, setMembers] = useState<Member[]>([])
  const [boats, setBoats] = useState<Boat[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingMemberId, setBookingMemberId] = useState('')
  const [selectedDate, setSelectedDate] = useState(getTodayString)

  const [showNewBooking, setShowNewBooking] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [bookingBoatId, setBookingBoatId] = useState('')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('08:00')

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const skipBackdropClick = useRef(false)

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
  }, [])

  useEffect(() => {
    const loadBookings = async () => {
      const dayStart = new Date(`${selectedDate}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      setIsLoading(true)
      const { data, error: bookingError } = await supabase
        .from('bookings')
        .select('id, boat_id, member_id, start_time, end_time, boats(name,type), members(name)')
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
  }, [selectedDate])

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

  const resetBookingForm = () => {
    setShowNewBooking(false)
    setEditingBooking(null)
    setBookingBoatId('')
    setBookingMemberId('')
    setStartTime('07:00')
    setEndTime('08:00')
  }

  const handleSaveBooking = async () => {
    setError(null)
    setStatus(null)

    if (!bookingBoatId) {
      setError('Select a boat for the booking.')
      return
    }

    if (!bookingMemberId) {
      setError('Select a member for the booking.')
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

    let conflictQuery = supabase
      .from('bookings')
      .select('id')
      .eq('boat_id', bookingBoatId)
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

    if (conflicts && conflicts.length > 0) {
      const message = 'That boat is already booked for the selected time.'
      setError(message)
      window.alert(message)
      return
    }

    if (editingBooking) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          boat_id: bookingBoatId,
          member_id: bookingMemberId,
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
      const { error: insertError } = await supabase.from('bookings').insert({
        boat_id: bookingBoatId,
        member_id: bookingMemberId,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      })

      if (insertError) {
        setError(insertError.message)
        return
      }
      setStatus('Booking confirmed!')
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

  return (
    <div className="app">
      <div className="page-pad">
        <header className="hero">
          <p className="eyebrow">RCRC Booking</p>
        </header>
      </div>

      <main className="shell">
        <section className="panel schedule-panel full-bleed-right">
          <div className="panel-header">
            <div className="actions">
              <label className="field compact">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
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
                        items.map((booking) => {
                          const boatName = getRelatedName(booking.boats) ?? 'Boat'
                          const boatType = getRelatedType(booking.boats)
                          const memberName = getRelatedName(booking.members) ?? 'Member'
                          return (
                            <button
                              key={booking.id}
                              type="button"
                              className="booking-pill"
                              onClick={() => {
                                setEditingBooking(booking)
                                setShowNewBooking(false)
                                setBookingBoatId(booking.boat_id)
                                setBookingMemberId(booking.member_id ?? '')
                                setStartTime(formatTimeInput(booking.start_time))
                                setEndTime(formatTimeInput(booking.end_time))
                              }}
                            >
                              <div>
                                <strong>
                                  {boatType ? `${boatType} ${boatName}` : boatName}
                                </strong>
                                <span>{memberName}</span>
                              </div>
                              <span className="booking-time">
                                {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                ))
              )}
          </div>
        </section>

        {status || error ? (
          <div className="page-pad">
            {status ? <div className="notice success">{status}</div> : null}
            {error ? <div className="notice error">{error}</div> : null}
          </div>
        ) : null}
      </main>

      {!showNewBooking && !editingBooking
        ? createPortal(
            <button
              className="fab"
              onClick={() => {
                skipBackdropClick.current = true
                setEditingBooking(null)
                setShowNewBooking(true)
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

      {showNewBooking || editingBooking ? (
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
              <h3>{editingBooking ? 'Edit booking' : 'New booking'}</h3>
              <button className="button ghost" onClick={resetBookingForm}>
                Close
              </button>
            </div>
            <div className="form-grid">
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
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
