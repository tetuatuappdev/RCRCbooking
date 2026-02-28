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

const formatLondonTime = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const formatOccurrenceLabel = (date, time) => {
  const dateTime = DateTime.fromISO(`${date}T${time}`, { zone: 'Europe/London' })
  return `${dateTime.toFormat('ccc d LLL')} • ${dateTime.toFormat('HH:mm')}`
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

  const nowLondon = DateTime.now().setZone('Europe/London')
  const windowStart = nowLondon.plus({ hours: 47, minutes: 45 })
  const windowEnd = nowLondon.plus({ hours: 48, minutes: 15 })

  const { data: templates, error } = await supabaseAdmin
    .from('booking_templates')
    .select('id, boat_id, member_id, weekday, start_time, end_time, boat_label, member_label, boats(name,type), members(name)')
    .not('member_id', 'is', null)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const candidateDates = []
  let cursor = windowStart.startOf('day')
  const endDay = windowEnd.startOf('day')
  while (cursor <= endDay) {
    candidateDates.push(cursor.toISODate())
    cursor = cursor.plus({ days: 1 })
  }

  const { data: exceptions, error: exceptionsError } = await supabaseAdmin
    .from('template_exceptions')
    .select('template_id, exception_date')
    .in('exception_date', candidateDates)

  if (exceptionsError) {
    res.status(500).json({ error: exceptionsError.message })
    return
  }

  const exceptionSet = new Set((exceptions ?? []).map((row) => `${row.template_id}:${row.exception_date}`))

  let created = 0
  let sent = 0

  for (const template of templates ?? []) {
    if (!template.member_id) {
      continue
    }

    for (const occurrenceDate of candidateDates) {
      const weekday = DateTime.fromISO(occurrenceDate, { zone: 'Europe/London' }).weekday % 7
      if (weekday !== template.weekday) {
        continue
      }

      const occurrenceStart = DateTime.fromISO(`${occurrenceDate}T${template.start_time}`, {
        zone: 'Europe/London',
      })

      if (occurrenceStart < windowStart || occurrenceStart >= windowEnd) {
        continue
      }

      if (exceptionSet.has(`${template.id}:${occurrenceDate}`)) {
        continue
      }

      const { data: confirmation, error: confirmationError } = await supabaseAdmin
        .from('template_confirmations')
        .upsert(
          {
            template_id: template.id,
            member_id: template.member_id,
            occurrence_date: occurrenceDate,
            status: 'pending',
          },
          { onConflict: 'template_id,occurrence_date' },
        )
        .select('id, notified_at')
        .single()

      if (confirmationError) {
        res.status(500).json({ error: confirmationError.message })
        return
      }

      created += 1

      if (confirmation.notified_at) {
        continue
      }

      const boatName = template.boats?.name || template.boat_label || 'Boat'
      const delivered = await sendToMember(template.member_id, {
        title: 'Template booking needs confirmation',
        body: `${boatName} • ${formatOccurrenceLabel(occurrenceDate, template.start_time)}. Confirm if this outing is still needed.`,
        url: '/',
      })

      if (delivered) {
        sent += 1
      }

      await supabaseAdmin
        .from('template_confirmations')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', confirmation.id)
    }
  }

  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }

  res.status(200).json({ ok: true, created, sent })
}
