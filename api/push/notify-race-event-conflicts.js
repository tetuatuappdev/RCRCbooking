import webpush from 'web-push'
import { readJson, requireUser, supabaseAdmin } from './_shared.js'

const vapidSubject = process.env.VAPID_SUBJECT
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error('Missing VAPID configuration.')
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const sendToMember = async (memberId, payload) => {
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('member_id', memberId)

  if (error || !subs || subs.length === 0) {
    return
  }

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload),
        )
      } catch (err) {
        const status = err?.statusCode
        if (status === 404 || status === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }),
  )
}

const formatLondonDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`))

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const user = await requireUser(req, res)
  if (!user) {
    return
  }

  let payload = {}
  try {
    payload = await readJson(req)
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload.' })
    return
  }

  const eventDate = typeof payload.eventDate === 'string' ? payload.eventDate : null
  const title = typeof payload.title === 'string' ? payload.title : 'Race event'
  const boatIds = Array.isArray(payload.boatIds) ? payload.boatIds.filter((id) => typeof id === 'string') : []

  if (!eventDate || boatIds.length === 0) {
    res.status(400).json({ error: 'Missing race event data.' })
    return
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()

  if (memberError || !member) {
    res.status(500).json({ error: memberError?.message || 'Member not found.' })
    return
  }

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('admins')
    .select('member_id')
    .eq('member_id', member.id)
    .maybeSingle()

  if (adminError || !adminRow) {
    res.status(403).json({ error: 'Only admins can notify race event conflicts.' })
    return
  }

  const dayStart = new Date(`${eventDate}T00:00:00`)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const { data: bookings, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('id, boat_id, member_id, start_time, boats(name)')
    .in('boat_id', boatIds)
    .lt('start_time', dayEnd.toISOString())
    .gte('start_time', dayStart.toISOString())
    .neq('usage_status', 'cancelled')
    .not('member_id', 'is', null)

  if (bookingError) {
    res.status(500).json({ error: bookingError.message })
    return
  }

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from('admins')
    .select('member_id')

  if (adminsError) {
    res.status(500).json({ error: adminsError.message })
    return
  }

  const adminIds = new Set((admins ?? []).map((row) => row.member_id))

  await Promise.all(
    (bookings ?? []).map(async (booking) => {
      if (!booking.member_id || adminIds.has(booking.member_id)) {
        return
      }

      const boatName = booking.boats?.name || 'Boat'
      await sendToMember(booking.member_id, {
        title: 'Booking conflicts with race event',
        body: `${boatName} is now assigned to "${title}" on ${formatLondonDate(eventDate)}. Your booking conflicts with this race event.`,
        url: '/',
      })
    }),
  )

  res.status(200).json({ ok: true })
}
