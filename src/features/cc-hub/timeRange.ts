export type ServerTodayRange = {
  startTime: number
  endTime: number
}

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

export function getServerTodayRange(timeZone: string, now: Date = new Date()): ServerTodayRange | null {
  try {
    const current = partsAt(now, timeZone)
    const startTime = zonedTimeToUtc({ ...current, hour: 0, minute: 0, second: 0 }, timeZone)
    const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1))
    const next = {
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      day: nextDate.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    }
    const nextStartTime = zonedTimeToUtc(next, timeZone)
    return { startTime, endTime: nextStartTime - 1 }
  } catch {
    return null
  }
}

function partsAt(date: Date, timeZone: string): DateParts {
  const formatter = formatterFor(timeZone)
  const values = formatter.formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') {
      result[part.type] = part.value
    }
    return result
  }, {})
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)
  if (cached) {
    return cached
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  formatters.set(timeZone, formatter)
  return formatter
}

function zonedTimeToUtc(parts: DateParts, timeZone: string): number {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  let candidate = localAsUtc
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = offsetAt(candidate, timeZone)
    const corrected = localAsUtc - offset
    if (corrected === candidate) {
      return corrected
    }
    candidate = corrected
  }
  return candidate
}

function offsetAt(timestamp: number, timeZone: string): number {
  const parts = partsAt(new Date(timestamp), timeZone)
  const displayedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return displayedAsUtc - timestamp
}
