const RIVER_STATUS_URL = 'https://river.grosvenor-rowingclub.org.uk/'

const stripTags = (value) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const htmlToText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|td|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim()

const normalizeSentence = (value) => value.replace(/\s+/g, ' ').trim()

const decodeEscapedMarkup = (value) =>
  value
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')

const parseStatusFromSource = (source) => {
  const statusMatch = source.match(
    /<[^>]*data-testid=["']text-rowing-status["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  )
  const statusText = statusMatch ? stripTags(statusMatch[1]) : ''
  const normalizedStatus = statusText.toLowerCase()

  const detailMatch = source.match(
    /<div[^>]*class=["'][^"']*text-white(?:\/|\\\/)90[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )
  const detailText = detailMatch ? stripTags(detailMatch[1]) : ''

  if (normalizedStatus.includes('no warning') || normalizedStatus.includes('no warnings')) {
    return {
      noWarning: true,
      statusMessage: 'No warning',
    }
  }

  if (normalizedStatus.includes('warning') || normalizedStatus.includes('waning')) {
    return {
      noWarning: false,
      statusMessage: detailText || statusText || 'Warning present, check river details.',
    }
  }

  const looseStatus = source.match(
    /text-rowing-status[\s\S]{0,180}?(no warnings?|warning|waning)/i,
  )
  if (looseStatus?.[1]) {
    const looseValue = looseStatus[1].toLowerCase()
    if (looseValue.includes('no warning')) {
      return {
        noWarning: true,
        statusMessage: 'No warning',
      }
    }
    return {
      noWarning: false,
      statusMessage: detailText || 'Warning present, check river details.',
    }
  }

  return null
}

const parseRiverStatus = (html) => {
  const escaped = decodeEscapedMarkup(html)
  const strictParsed = parseStatusFromSource(html) ?? parseStatusFromSource(escaped)
  if (strictParsed) {
    return strictParsed
  }

  const text = htmlToText(html)
  const lower = text.toLowerCase()

  if (!lower) {
    return {
      noWarning: false,
      statusMessage: 'Warning status unavailable. Please check river site.',
    }
  }

  if (lower.includes('no warning') || lower.includes('no warnings')) {
    return {
      noWarning: true,
      statusMessage: 'No warning',
    }
  }

  const lines = text
    .split('\n')
    .map((line) => normalizeSentence(line))
    .filter((line) => line.length >= 3)

  const warningLine =
    lines.find((line) => /warning/i.test(line) && !/no warnings?/i.test(line)) ??
    lines.find((line) => /(amber|red|caution|unsafe|closed|strong stream|stream)/i.test(line))

  if (warningLine) {
    return {
      noWarning: false,
      statusMessage: warningLine,
    }
  }

  return {
    noWarning: false,
    statusMessage: 'Warning present or unavailable, check river site before outing.',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    const response = await fetch(RIVER_STATUS_URL, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`River page returned ${response.status}.`)
    }

    const html = await response.text()
    const escaped = decodeEscapedMarkup(html)
    const parsed = parseRiverStatus(html)
    const debugRequested =
      req.query?.debug === '1' ||
      (Array.isArray(req.query?.debug) && req.query.debug.includes('1'))

    if (req.method === 'HEAD') {
      res.status(200).end()
      return
    }

    if (debugRequested) {
      const hasTextRowingStatus = /text-rowing-status/i.test(html)
      const hasTextRowingStatusEscaped = /text-rowing-status/i.test(escaped)
      const hasNoWarning = /no warnings?/i.test(html)
      const hasNoWarningEscaped = /no warnings?/i.test(escaped)
      const hasWarning = /\bwarning\b|\bwaning\b/i.test(html)
      const hasWarningEscaped = /\bwarning\b|\bwaning\b/i.test(escaped)
      res.status(200).json({
        ok: true,
        noWarning: parsed.noWarning,
        statusMessage: parsed.statusMessage,
        debug: {
          fetchedStatus: response.status,
          finalUrl: response.url,
          htmlLength: html.length,
          hasTextRowingStatus,
          hasTextRowingStatusEscaped,
          hasNoWarning,
          hasNoWarningEscaped,
          hasWarning,
          hasWarningEscaped,
          sample: html.slice(0, 500),
        },
      })
      return
    }

    res.status(200).json({
      ok: true,
      noWarning: parsed.noWarning,
      statusMessage: parsed.statusMessage,
    })
  } catch (error) {
    if (req.method === 'HEAD') {
      res.status(200).end()
      return
    }
    res.status(200).json({
      ok: true,
      noWarning: false,
      statusMessage: 'Warning status unavailable. Please check river site.',
      error: error instanceof Error ? error.message : 'Unable to read river status.',
    })
  }
}
