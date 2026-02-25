import { readJson, requireUser, supabaseAdmin } from './_shared.js'

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

  const endpoint = payload.endpoint
  if (!endpoint) {
    res.status(400).json({ error: 'Missing endpoint.' })
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

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('member_id', member.id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true })
}
