import webpush from 'web-push'
import { readJson, requireUser, supabaseAdmin } from './_shared.js'

const vapidSubject = process.env.VAPID_SUBJECT
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error('Missing VAPID configuration.')
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

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
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()

  if (memberError) {
    res.status(500).json({ error: memberError.message })
    return
  }

  if (!member) {
    res.status(404).json({ error: 'Member not found.' })
    return
  }

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('member_id', member.id)

  if (subsError) {
    res.status(500).json({ error: subsError.message })
    return
  }

  if (!subs || subs.length === 0) {
    res.status(404).json({ error: 'No push subscriptions found for this user.' })
    return
  }

  const notification = {
    title: typeof payload.title === 'string' && payload.title ? payload.title : 'RCRC test notification',
    body:
      typeof payload.body === 'string' && payload.body
        ? payload.body
        : 'Push notifications are configured correctly.',
    url: '/',
  }

  let sent = 0
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
          JSON.stringify(notification),
        )
        sent += 1
      } catch (err) {
        const status = err?.statusCode
        if (status === 404 || status === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }),
  )

  res.status(200).json({ ok: true, sent })
}
