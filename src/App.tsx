import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [templateBookings, setTemplateBookings] = useState<TemplateBooking[]>([])
  const [templateExceptions, setTemplateExceptions] = useState<TemplateException[]>([])
  const [bookingMemberId, setBookingMemberId] = useState('')
  const [selectedDate, setSelectedDate] = useState(getTodayString)

  const [showNewBooking, setShowNewBooking] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<ScheduleItem | null>(null)
  const [bookingBoatId, setBookingBoatId] = useState('')
  const [startTime, setStartTime] = useState('07:30')
  const [endTime, setEndTime] = useState('08:00')

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!status) {
      return
    }
    const timer = window.setTimeout(() => setStatus(null), 5000)
    return () => window.clearTimeout(timer)
  }, [status])
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
  }, [selectedDate])

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const fromBookings: ScheduleItem[] = bookings.map((booking) => ({
      ...booking,
      isTemplate: false,
    }))

    const excludedTemplateIds = new Set(
      templateExceptions.map((exception) => exception.template_id),
    )

    const fromTemplates: ScheduleItem[] = templateBookings
      .filter((template) => !excludedTemplateIds.has(template.id))
      .map((template) => {
      const startTime = normalizeTime(template.start_time)
      const endTime = normalizeTime(template.end_time)
      return {
        id: `template-${template.id}`,
        templateId: template.id,
        boat_id: template.boat_id,
        member_id: template.member_id,
        start_time: new Date(`${selectedDate}T${startTime}:00`).toISOString(),
        end_time: new Date(`${selectedDate}T${endTime}:00`).toISOString(),
        boats: template.boats ?? null,
        members: template.members ?? null,
        boat_label: template.boat_label ?? null,
        member_label: template.member_label ?? null,
        isTemplate: true,
      }
    })

    return [...fromTemplates, ...fromBookings]
  }, [bookings, templateBookings, selectedDate])

  const ganttLayout = useMemo(() => {
    const timelineStart = START_HOUR
    const timelineEnd = END_HOUR
    const dayStart = new Date(`${selectedDate}T07:30:00`)
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
    setBookingMemberId('')
    setStartTime('07:30')
    setEndTime('08:30')
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

    const templateConflict = templateBookings.some((template) => {
      if (!template.boat_id) {
        return false
      }
      if (template.boat_id !== bookingBoatId) {
        return false
      }
      const startTime = normalizeTime(template.start_time)
      const endTime = normalizeTime(template.end_time)
      const templateStart = new Date(`${selectedDate}T${startTime}:00`)
      const templateEnd = new Date(`${selectedDate}T${endTime}:00`)
      return templateStart < endDate && templateEnd > startDate
    })

    if (templateConflict) {
      const message = 'That boat has a default booking during this time.'
      setError(null)
      window.alert(message)
      return
    }

    if (conflicts && conflicts.length > 0) {
      const message = 'That boat is already booked for the selected time.'
      setError(null)
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

  const handleDeleteTemplate = async () => {
    if (!editingTemplate?.templateId) {
      return
    }

    setError(null)
    setStatus(null)

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

  return (
    <div
      className="app"
      onPointerDown={() => {
        if (status) {
          setStatus(null)
        }
      }}
    >
      <div className="page-pad">
        <header className="hero">
          <p className="eyebrow">RCRC Booking</p>
        </header>
      </div>

      <main className="shell">
        <div className="page-pad schedule-top">
          <div className="actions">
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
              <span className="date-label">
                {new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
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
            </div>
            {status || error ? (
              <div className="status-inline">
                {status ? <div className="notice success">{status}</div> : null}
                {error ? <div className="notice error">{error}</div> : null}
              </div>
            ) : null}
          </div>
        </div>

        <section className="panel schedule-panel full-bleed-right">
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
                              onClick={() => {
                                if (booking.isTemplate) {
                                  if (!booking.boat_id || !booking.templateId) {
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
                                setBookingBoatId(booking.boat_id)
                                setBookingMemberId(booking.member_id ?? '')
                                setStartTime(formatTimeInput(booking.start_time))
                                setEndTime(formatTimeInput(booking.end_time))
                              }}
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
        </section>

      </main>

      {!showNewBooking && !editingBooking && !editingTemplate
        ? createPortal(
            <button
              className="fab"
              onClick={() => {
                skipBackdropClick.current = true
                setEditingBooking(null)
                setEditingTemplate(null)
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

      {showNewBooking || editingBooking || editingTemplate ? (
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
                {editingTemplate ? 'Template booking' : editingBooking ? 'Edit booking' : 'New booking'}
              </h3>
              <button className="button ghost" onClick={resetBookingForm}>
                Close
              </button>
            </div>
            {editingTemplate ? (
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
            ) : (
              <>
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
    </div>
  )
}

export default App
