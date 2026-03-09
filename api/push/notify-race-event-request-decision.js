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
  const decision = payload.decision === 'approved' || payload.decision === 'rejected' ? payload.decision : null

  if (!requestId || !decision) {
    res.status(400).json({ error: 'Missing request decision payload.' })
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

  if (adminError) {
    res.status(500).json({ error: adminError.message })
    return
  }

  const { data: allowRow, error: allowError } = await supabaseAdmin
    .from('allowed_member')
    .select('role')
    .ilike('email', user.email)
    .maybeSingle()

  if (allowError) {
    res.status(500).json({ error: allowError.message })
    return
  }

  const isCaptain = allowRow?.role === 'captain'
  if (!adminRow && !isCaptain) {
    res.status(403).json({ error: 'Only captains or admins can send decision notifications.' })
    return
  }

  const { data: request, error: requestError } = await supabaseAdmin
    .from('race_event_change_requests')
    .select(
      'id, requested_by_member_id, status, race_events(title,start_date,end_date)',
    )
    .eq('id', requestId)
    .maybeSingle()

  if (requestError || !request) {
    res.status(500).json({ error: requestError?.message || 'Request not found.' })
    return
  }

  if (request.status !== decision) {
    res.status(409).json({ error: 'Request status does not match decision.' })
    return
  }

  const title = request.race_events?.title || 'Race event'
  const dateRange =
    request.race_events?.start_date && request.race_events?.end_date
      ? `${formatLondonDate(request.race_events.start_date)} - ${formatLondonDate(request.race_events.end_date)}`
      : ''

  await sendToMember(request.requested_by_member_id, {
    title: `Race event request ${decision}`,
    body:
      decision === 'approved'
        ? `Your update request for "${title}" ${dateRange} was approved.`
        : `Your update request for "${title}" ${dateRange} was rejected.`,
    url: '/',
  })

  res.status(200).json({ ok: true })
}
