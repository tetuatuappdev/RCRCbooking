import webpush from 'web-push'
import { readJson, requireUser, supabaseAdmin } from './_shared.js'

const vapidSubject = process.env.VAPID_SUBJECT
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error('Missing VAPID configuration.')
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const formatLondonDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`))

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

  const requestId = typeof payload.requestId === 'string' ? payload.requestId : null
  if (!requestId) {
    res.status(400).json({ error: 'Missing requestId.' })
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

  const { data: request, error: requestError } = await supabaseAdmin
    .from('race_event_change_requests')
    .select(
      'id, race_event_id, requested_by_member_id, previous_boat_ids, requested_boat_ids, status, requested_by_member:members!race_event_change_requests_requested_by_member_id_fkey(name), race_events(title,start_date,end_date)',
    )
    .eq('id', requestId)
    .eq('requested_by_member_id', member.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (requestError || !request) {
    res.status(500).json({ error: requestError?.message || 'Change request not found.' })
    return
  }

  const { data: admins, error: adminsError } = await supabaseAdmin.from('admins').select('member_id')
  if (adminsError) {
    res.status(500).json({ error: adminsError.message })
    return
  }

  const previousSet = new Set(request.previous_boat_ids ?? [])
  const addedCount = (request.requested_boat_ids ?? []).filter((boatId) => !previousSet.has(boatId)).length
  const requesterName = request.requested_by_member?.name || 'Coordinator'
  const title = request.race_events?.title || 'Race event'
  const dateRange =
    request.race_events?.start_date && request.race_events?.end_date
      ? `${formatLondonDate(request.race_events.start_date)} - ${formatLondonDate(request.race_events.end_date)}`
      : ''

  await Promise.all(
    (admins ?? []).map(async (admin) => {
      await sendToMember(admin.member_id, {
        title: 'Race event update request',
        body: `${requesterName} requested to add ${addedCount} boat(s) on "${title}" ${dateRange}`.trim(),
        url: '/',
      })
    }),
  )

  res.status(200).json({ ok: true })
}
