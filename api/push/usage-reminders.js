import webpush from 'web-push'
import { DateTime } from 'luxon'
import { supabaseAdmin } from './_shared.js'

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
    return false
  }

  let delivered = false

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
        delivered = true
      } catch (err) {
        const status = err?.statusCode
        if (status === 404 || status === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }),
  )

  return delivered
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = req.headers['x-cron-secret']
    const querySecret =
      typeof req.query?.secret === 'string'
        ? req.query.secret
        : Array.isArray(req.query?.secret)
          ? req.query.secret[0]
          : null
    if (header !== secret && querySecret !== secret) {
      res.status(401).json({ error: 'Unauthorized.' })
      return
    }
  }

  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const nowUtc = DateTime.now().toUTC().toISO()

  const { error: transitionError } = await supabaseAdmin
    .from('bookings')
    .update({ usage_status: 'pending' })
    .eq('usage_status', 'scheduled')
    .lt('end_time', nowUtc)
    .not('member_id', 'is', null)

  if (transitionError) {
    res.status(500).json({ error: transitionError.message })
    return
  }

  const { data: pendingBookings, error: pendingError } = await supabaseAdmin
    .from('bookings')
    .select('id, start_time, end_time, member_id, boats(name)')
    .eq('usage_status', 'pending')
    .not('member_id', 'is', null)
    .order('end_time', { ascending: true })

  if (pendingError) {
    res.status(500).json({ error: pendingError.message })
    return
  }

  let sent = 0
  let pending = 0

  for (const booking of pendingBookings ?? []) {
    if (!booking.member_id) {
      continue
    }
    pending += 1

    const { error: dedupeError } = await supabaseAdmin.from('booking_usage_notifications').insert({
      booking_id: booking.id,
    })

    if (dedupeError?.code === '23505') {
      continue
    }

    const boatName = booking.boats?.name || 'Boat'
    const dateLabel = formatLondonDate(booking.start_time)
    const start = formatLondonTime(booking.start_time)
    const end = formatLondonTime(booking.end_time)

    const delivered = await sendToMember(booking.member_id, {
      title: 'Booking confirmation required',
      body: `${boatName} • ${dateLabel} • ${start}-${end}. Confirm if the outing happened.`,
      url: '/',
    })

    if (delivered) {
      sent += 1
    }
  }

  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }

  res.status(200).json({
    ok: true,
    pending,
    sent,
  })
}
