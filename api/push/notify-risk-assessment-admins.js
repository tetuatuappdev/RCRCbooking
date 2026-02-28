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

  const riskAssessmentId =
    typeof payload.riskAssessmentId === 'string' ? payload.riskAssessmentId : null
  const bookingId = typeof payload.bookingId === 'string' ? payload.bookingId : null

  if (!riskAssessmentId || !bookingId) {
    res.status(400).json({ error: 'Missing risk assessment context.' })
    return
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('id, name')
    .ilike('email', user.email)
    .maybeSingle()

  if (memberError || !member) {
    res.status(500).json({ error: memberError?.message || 'Member not found.' })
    return
  }

  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from('risk_assessments')
    .select('id, member_id, coordinator_name, session_date, session_time')
    .eq('id', riskAssessmentId)
    .maybeSingle()

  if (assessmentError || !assessment) {
    res.status(500).json({ error: assessmentError?.message || 'Risk assessment not found.' })
    return
  }

  if (assessment.member_id !== member.id) {
    res.status(403).json({ error: 'You can only notify for your own risk assessment.' })
    return
  }

  const { data: link, error: linkError } = await supabaseAdmin
    .from('booking_risk_assessments')
    .select('booking_id')
    .eq('booking_id', bookingId)
    .eq('risk_assessment_id', riskAssessmentId)
    .maybeSingle()

  if (linkError || !link) {
    res.status(500).json({ error: linkError?.message || 'Risk assessment link not found.' })
    return
  }

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('id, start_time, boats(name)')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingError || !booking) {
    res.status(500).json({ error: bookingError?.message || 'Booking not found.' })
    return
  }

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from('admins')
    .select('member_id')

  if (adminsError) {
    res.status(500).json({ error: adminsError.message })
    return
  }

  const boatName = booking.boats?.name || 'Boat'
  const dateLabel = formatLondonDate(booking.start_time)
  const timeLabel = formatLondonTime(booking.start_time)

  await Promise.all(
    (admins ?? []).map(async (admin) => {
      await sendToMember(admin.member_id, {
        title: 'New risk assessment submitted',
        body: `${assessment.coordinator_name} submitted a risk assessment for ${boatName} on ${dateLabel} at ${timeLabel}.`,
        url: '/',
      })
    }),
  )

  res.status(200).json({ ok: true })
}
