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

  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('id, name')
    .ilike('email', user.email)
    .maybeSingle()

  if (memberError || !member) {
    res.status(500).json({ error: memberError?.message || 'Member not found.' })
    return
  }

  const decision = payload.decision === 'approved' || payload.decision === 'rejected' ? payload.decision : null
  if (decision) {
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : null
    if (!requestId) {
      res.status(400).json({ error: 'Missing requestId.' })
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

    if (!adminRow && allowRow?.role !== 'captain') {
      res.status(403).json({ error: 'Only captains or admins can send this notification.' })
      return
    }

    const { data: request, error: requestError } = await supabaseAdmin
      .from('captain_booking_requests')
      .select('id, member_id, status, boats(name)')
      .eq('id', requestId)
      .maybeSingle()

    if (requestError || !request) {
      res.status(500).json({ error: requestError?.message || 'Request not found.' })
      return
    }

    if (request.status !== decision) {
      res.status(409).json({ error: 'Decision does not match current status.' })
      return
    }

    const boatName = request.boats?.name || 'Boat'
    await sendToMember(request.member_id, {
      title: `Captain booking request ${decision}`,
      body:
        decision === 'approved'
          ? `Your booking request for ${boatName} was approved.`
          : `Your booking request for ${boatName} was rejected.`,
      url: '/',
    })

    res.status(200).json({ ok: true })
    return
  }

  const requestIds = Array.isArray(payload.requestIds)
    ? payload.requestIds.filter((id) => typeof id === 'string')
    : []

  if (requestIds.length === 0) {
    res.status(400).json({ error: 'Missing requestIds.' })
    return
  }

  const { data: requests, error: requestError } = await supabaseAdmin
    .from('captain_booking_requests')
    .select('id, member_id')
    .in('id', requestIds)

  if (requestError || !requests || requests.length !== requestIds.length) {
    res.status(500).json({ error: requestError?.message || 'Booking requests not found.' })
    return
  }

  if (requests.some((row) => row.member_id !== member.id)) {
    res.status(403).json({ error: 'You can only notify for your own requests.' })
    return
  }

  const { data: admins, error: adminsError } = await supabaseAdmin.from('admins').select('member_id')
  if (adminsError) {
    res.status(500).json({ error: adminsError.message })
    return
  }

  const { data: captains, error: captainsError } = await supabaseAdmin
    .from('allowed_member')
    .select('email')
    .eq('role', 'captain')

  if (captainsError) {
    res.status(500).json({ error: captainsError.message })
    return
  }

  const captainEmails = (captains ?? []).map((row) => row.email).filter(Boolean)
  let captainMemberIds = []
  if (captainEmails.length > 0) {
    const { data: captainMembers, error: captainMembersError } = await supabaseAdmin
      .from('members')
      .select('id,email')
      .in('email', captainEmails)
    if (captainMembersError) {
      res.status(500).json({ error: captainMembersError.message })
      return
    }
    captainMemberIds = (captainMembers ?? []).map((row) => row.id)
  }

  const approverIds = Array.from(
    new Set([...(admins ?? []).map((row) => row.member_id), ...captainMemberIds]),
  )

  await Promise.all(
    approverIds.map(async (memberId) => {
      await sendToMember(memberId, {
        title: 'Captain permission booking request',
        body: `${member.name} requested a captain approval booking.`,
        url: '/',
      })
    }),
  )

  res.status(200).json({ ok: true, sent: approverIds.length })
}
