import webpush from 'web-push'
import { readJson, requireUser, supabaseAdmin } from './_shared.js'

const vapidSubject = process.env.VAPID_SUBJECT
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error('Missing VAPID configuration.')
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const formatLondonTime = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const formatLondonDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))

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

  const bookingIds = Array.isArray(payload.bookingIds) ? payload.bookingIds : []
  if (bookingIds.length === 0) {
    res.status(400).json({ error: 'Missing booking IDs.' })
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

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('member_id')
    .eq('member_id', member.id)
    .maybeSingle()

  const isAdmin = Boolean(adminRow)

  const { data: bookings, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('id, start_time, end_time, member_id, boats(name)')
    .in('id', bookingIds)

  if (bookingError) {
    res.status(500).json({ error: bookingError.message })
    return
  }

  if (!bookings || bookings.length === 0) {
    res.status(200).json({ ok: true })
    return
  }

  for (const booking of bookings) {
    if (!booking.member_id) {
      continue
    }
    if (!isAdmin && booking.member_id !== member.id) {
      continue
    }
    const boatName = booking.boats?.name || 'Boat'
    const dateLabel = formatLondonDate(booking.start_time)
    const start = formatLondonTime(booking.start_time)
    const end = formatLondonTime(booking.end_time)
    await sendToMember(booking.member_id, {
      title: 'Booking confirmed',
      body: `${boatName} • ${dateLabel} • ${start}–${end} (London)`,
      url: '/',
    })
  }

  res.status(200).json({ ok: true })
}
