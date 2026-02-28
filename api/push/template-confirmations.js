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

const formatOccurrenceLabel = (date, time) => {
  const dateTime = DateTime.fromISO(`${date}T${time}`, { zone: 'Europe/London' })
  return `${dateTime.toFormat('ccc d LLL')} at ${dateTime.toFormat('HH:mm')}`
}

const buildKey = (templateId, occurrenceDate) => `${templateId}:${occurrenceDate}`

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

  const today = DateTime.now().setZone('Europe/London').startOf('day')
  const notificationDate = today.plus({ days: 3 }).toISODate()
  const autoCancelDates = [today.plus({ days: 1 }).toISODate(), today.plus({ days: 2 }).toISODate()]
  const relevantDates = [notificationDate, ...autoCancelDates]

  const { data: templates, error: templatesError } = await supabaseAdmin
    .from('booking_templates')
    .select(
      'id, boat_id, member_id, weekday, start_time, end_time, boat_label, member_label, boats(name,type), members(name)',
    )
    .not('member_id', 'is', null)

  if (templatesError) {
    res.status(500).json({ error: templatesError.message })
    return
  }

  const [{ data: exceptions, error: exceptionsError }, { data: confirmations, error: confirmationsError }] =
    await Promise.all([
      supabaseAdmin
        .from('template_exceptions')
        .select('template_id, exception_date')
        .in('exception_date', relevantDates),
      supabaseAdmin
        .from('template_confirmations')
        .select('id, template_id, occurrence_date, member_id, status, booking_id, notified_at')
        .in('occurrence_date', relevantDates),
    ])

  if (exceptionsError) {
    res.status(500).json({ error: exceptionsError.message })
    return
  }

  if (confirmationsError) {
    res.status(500).json({ error: confirmationsError.message })
    return
  }

  const exceptionSet = new Set((exceptions ?? []).map((row) => buildKey(row.template_id, row.exception_date)))
  const confirmationMap = new Map(
    (confirmations ?? []).map((row) => [buildKey(row.template_id, row.occurrence_date), row]),
  )

  let pendingCreated = 0
  let remindersSent = 0
  let autoRemoved = 0
  let removalNoticesSent = 0

  for (const template of templates ?? []) {
    if (!template.member_id) {
      continue
    }

    const datesToCheck = [notificationDate, ...autoCancelDates]

    for (const occurrenceDate of datesToCheck) {
      const weekday = DateTime.fromISO(occurrenceDate, { zone: 'Europe/London' }).weekday % 7
      if (weekday !== template.weekday) {
        continue
      }

      const key = buildKey(template.id, occurrenceDate)
      if (exceptionSet.has(key)) {
        continue
      }

      const boatName = template.boats?.name || template.boat_label || 'Boat'
      const existingConfirmation = confirmationMap.get(key) ?? null

      if (occurrenceDate === notificationDate) {
        if (existingConfirmation?.status === 'confirmed' || existingConfirmation?.status === 'cancelled') {
          continue
        }

        let confirmation = existingConfirmation
        if (!confirmation) {
          const { data: insertedConfirmation, error: insertError } = await supabaseAdmin
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
            .select('id, template_id, occurrence_date, member_id, status, booking_id, notified_at')
            .single()

          if (insertError) {
            res.status(500).json({ error: insertError.message })
            return
          }

          confirmation = insertedConfirmation
          confirmationMap.set(key, insertedConfirmation)
          pendingCreated += 1
        }

        if (!confirmation.notified_at) {
          const delivered = await sendToMember(template.member_id, {
            title: 'Template booking needs confirmation',
            body: `${boatName} on ${formatOccurrenceLabel(occurrenceDate, template.start_time)} needs to be confirmed.`,
            url: '/',
          })

          if (delivered) {
            remindersSent += 1
          }

          const notifiedAt = new Date().toISOString()
          const { error: updateError } = await supabaseAdmin
            .from('template_confirmations')
            .update({ notified_at: notifiedAt })
            .eq('id', confirmation.id)

          if (updateError) {
            res.status(500).json({ error: updateError.message })
            return
          }

          confirmationMap.set(key, { ...confirmation, notified_at: notifiedAt })
        }

        continue
      }

      if (existingConfirmation?.status === 'confirmed') {
        continue
      }

      const respondedAt = new Date().toISOString()
      const { error: exceptionError } = await supabaseAdmin
        .from('template_exceptions')
        .upsert(
          {
            template_id: template.id,
            exception_date: occurrenceDate,
          },
          { onConflict: 'template_id,exception_date' },
        )

      if (exceptionError) {
        res.status(500).json({ error: exceptionError.message })
        return
      }

      exceptionSet.add(key)
      autoRemoved += 1

      const { data: cancelledConfirmation, error: cancelError } = await supabaseAdmin
        .from('template_confirmations')
        .upsert(
          {
            template_id: template.id,
            member_id: template.member_id,
            occurrence_date: occurrenceDate,
            status: 'cancelled',
            responded_at: respondedAt,
          },
          { onConflict: 'template_id,occurrence_date' },
        )
        .select('id, template_id, occurrence_date, member_id, status, booking_id, notified_at')
        .single()

      if (cancelError) {
        res.status(500).json({ error: cancelError.message })
        return
      }

      confirmationMap.set(key, cancelledConfirmation)

      if (existingConfirmation?.status !== 'cancelled') {
        const delivered = await sendToMember(template.member_id, {
          title: 'Template booking removed',
          body: `${boatName} on ${formatOccurrenceLabel(occurrenceDate, template.start_time)} was removed because it was not confirmed in time.`,
          url: '/',
        })

        if (delivered) {
          removalNoticesSent += 1
        }
      }
    }
  }

  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }

  res.status(200).json({
    ok: true,
    notificationDate,
    autoCancelDates,
    pendingCreated,
    remindersSent,
    autoRemoved,
    removalNoticesSent,
  })
}
