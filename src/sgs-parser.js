import * as cheerio from 'cheerio'

// shared helpers
function clean(text) { return (text || '').replace(/\s+/g, ' ').trim() }
function parsePageMeta($) {
  return {
    school: clean($('td.NewLogo').first().text()) || null,
    user: clean($('#ctl00__PageHeader__UserStatusLbl').text()) || null,
  }
}
function parseDetailTable($, tableEl) {
  const obj = {}

  $(tableEl).find('> tbody > tr, > tr').each((_, tr) => {
    const cells = $(tr).find('> td')
    if (cells.length >= 2) {
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const key = clean(cells.eq(i).text()).replace(/:$/, '').trim()
        const value = clean(cells.eq(i + 1).text())
        if (key && key !== '\u00a0') obj[key] = value
      }
    }
  })

  return obj
}
function parseGridTable($, tableEl) {
  const rows = $(tableEl).find('> tbody > tr, > tr').toArray()
  if (rows.length === 0) return []

  const headers = []
  $(rows[0]).find('> th, > td').each((_, cell) => {
    const span = parseInt($(cell).attr('colspan') || '1', 10)
    const text = clean($(cell).text())
    for (let i = 0; i < span; i++) headers.push(text || `col_${headers.length}`)
  })

  const result = []
  for (let r = 1; r < rows.length; r++) {
    const cells = $(rows[r]).find('> td')
    if (cells.length === 0) continue
    const row = {}
    cells.each((i, td) => {
      const header = headers[i] !== undefined ? headers[i] : `col_${i}`
      row[header] = clean($(td).text())
    })
    result.push(row)
  }
  return result
}
export function parseTblStudentsInfo(html) { // per-page parsers
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  const infoEl = $('#ctl00_PageContent_Info')

  const lines = new Set()
  infoEl.find('p, li, span').each((_, el) => {
    $(el).html()
      ?.replace(/<br\s*\/?>/gi, '\n')
      .split('\n')
      .map(s => cheerio.load(s).text().trim().replace(/^-\s*/, ''))
      .filter(s => s.length > 2)
      .forEach(s => lines.add(s))
  })

  const title = infoEl.find('span[style]').filter((_, el) => {
    const style = $(el).attr('style') || ''
    return style.includes('bold') || style.includes('0000ff')
  }).first().text().trim() || null

  return {
    page: 'announcements',
    ...meta,
    announcement: { title, lines: [...lines] },
  }
}
export function parseTblStudents(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  const panel = $('#ctl00_PageContent_TblStudentsRecordControlPanel')
  const profileTable = panel.find('table').first()
  const profile = {}

  profileTable.find('tr').each((_, tr) => {
    const cells = $(tr).find('td')
    // 4-column layout
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const key = cells.eq(i).text().trim().replace(/:$/, '').trim()
      const value = cells.eq(i + 1).text().trim()
      if (key && key !== '\u00a0' && key !== '') profile[key] = value
    }
  })

  return { page: 'student_profile', ...meta, profile }
}
export function parseTblStudentsEmail(html) {
  const $ = cheerio.load(html)

  const flsTables = []
  $('table').each((_, t) => {
    const flsCells = $(t).find('td.fls').length
    if (flsCells > 0) {
      const rows = $(t).find('tr').length
      flsTables.push({ el: t, rows, flsCells })
    }
  })
  flsTables.sort((a, b) => a.rows - b.rows)

  function isClean(tableEl) {
    const keys = []
    $(tableEl).find('> tbody > tr, > tr').each((_, tr) => {
      const cells = $(tr).find('td')
      for (let i = 0; i + 1 < cells.length; i += 2) {
        keys.push(cells.eq(i).text().trim())
      }
    })
    if (keys.length < 3) return false
    const shortKeys = keys.filter(k => k.length > 0 && k.length < 30)
    return shortKeys.length / keys.length > 0.7
  }

  const cleanTables = flsTables.filter(t => isClean(t.el))
  const profileTable = cleanTables[0]?.el || null
  const enrollmentTable = cleanTables[1]?.el || null

  const profile = profileTable ? parseDetailTable($, profileTable) : {}
  const enrollment = enrollmentTable ? parseDetailTable($, enrollmentTable) : {}

  const school = $('td.NewLogo').first().text().trim() || null
  return { page: 'student_email', school, user: null, profile, enrollment }
}
export function parseTranscriptsAttend(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  let gridTable = null
  $('table').each((_, t) => {
    const firstRow = $(t).find('tr').first()
    const ths = firstRow.find('th')
    const tds = firstRow.find('td')
    if (ths.length >= 5 && tds.length === 0) {
      const headerText = ths.map((__, th) => $(th).text().trim()).get().join(' ')
      if (headerText.includes('ชื่อวิชา') &&
        (headerText.includes('วันที่') || headerText.includes('ขาดเรียน'))) {
        gridTable = t
        return false
      }
    }
  })

  const records = gridTable ? parseGridTable($, gridTable) : []
  return { page: 'attendance', ...meta, records }
}
export function parseTransScoreSub(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  const semesterValue = $('select[id*="ColTrFilter"] option[selected]').val() || null
  const semesterLabel = clean($('select[id*="ColTrFilter"] option[selected]').text()) || null

  let gradeTable = null
  $('table').each((_, t) => {
    const directRows = $(t).find('> tbody > tr, > tr').toArray()
    if (directRows.length < 3) return
    const r0 = $(directRows[0])
    const r0ths = r0.find('> th')
    const r0tds = r0.find('> td')
    if (r0ths.length < 5 || r0tds.length > 0) return
    const r0text = r0ths.map((__, th) => clean($(th).text())).get().join(' ')
    if (!r0text.includes('ขื่อวิชา') && !r0text.includes('ชื่อวิชา')) return
    if (!r0text.includes('หน่วยกิต')) return

    const r1ths = $(directRows[1]).find('> th')
    if (r1ths.length < 5) return
    gradeTable = t
    return false
  })

  let subjects = []
  if (gradeTable) {
    const directRows = $(gradeTable).find('> tbody > tr, > tr').toArray()

    const row0cells = $(directRows[0]).find('> th').toArray()
    const row1cells = $(directRows[1]).find('> th').toArray()

    const headers = []
    let r1idx = 0
    for (const cell of row0cells) {
      const colspan = parseInt($(cell).attr('colspan') || '1', 10)
      const rowspan = parseInt($(cell).attr('rowspan') || '1', 10)
      const label = clean($(cell).text())
      if (rowspan >= 2) {
        for (let c = 0; c < colspan; c++) headers.push(label)
      } else {
        for (let c = 0; c < colspan; c++) {
          const sub = row1cells[r1idx] ? clean($(row1cells[r1idx]).text()) : ''
          headers.push(sub ? `${label}_${sub}` : label)
          r1idx++
        }
      }
    }

    for (let r = 2; r < directRows.length; r++) {
      const cells = $(directRows[r]).find('> td')
      if (cells.length === 0) continue
      if (parseInt($(cells[0]).attr('colspan') || '1', 10) > 3) continue
      if (cells.length < 3) continue

      const row = {}
      cells.each((i, td) => { row[headers[i] ?? `col_${i}`] = clean($(td).text()) })
      subjects.push(row)
    }
  }

  let summaryTable = null
  $('table').each((_, t) => {
    const directRows = $(t).find('> tbody > tr, > tr').toArray()
    for (const tr of directRows) {
      const cells = $(tr).find('> th, > td')
      if (cells.length >= 2 && clean(cells.eq(0).text()) === 'ประเภทวิชา') {
        summaryTable = t
        return false
      }
    }
  })

  const summary = {}
  if (summaryTable) {
    $(summaryTable).find('> tbody > tr, > tr').each((_, tr) => {
      const cells = $(tr).find('> td')
      if (cells.length >= 2) {
        const key = clean(cells.eq(0).text())
        const val = clean(cells.eq(1).text())
        if (key && val && key.length < 40) summary[key] = val
      }
    })
  }

  const gpaRaw = clean($('#ctl00_PageContent_GPALabel').text()) || summary['GPA'] || null
  const gpa = gpaRaw ? parseFloat(gpaRaw) : null

  return {
    page: 'grades',
    ...meta,
    semesterValue,
    semesterLabel,
    gpa,
    subjects,
    summary,
  }
}
export function parseSubjectsElection(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  let selectedTable = null
  let availableTable = null

  $('table').each((_, t) => {
    const ths = $(t).find('tr').first().find('th, td')
      .map((__, c) => $(c).text().trim()).get()
    if (ths.some(h => h === 'ผลการเลือก') && !selectedTable) selectedTable = t
    if (ths.some(h => h === 'รับ') && !availableTable) availableTable = t
  })

  return {
    page: 'elective_subjects',
    ...meta,
    selectedSubjects: selectedTable ? parseGridTable($, selectedTable) : [],
    availableSubjects: availableTable ? parseGridTable($, availableTable) : [],
  }
}
export function parseReGradeReq(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  let gridTable = null
  $('table').each((_, t) => {
    const ths = $(t).find('th').map((__, th) => $(th).text().trim()).get()
    if (ths.some(h => h.includes('วิชา')) && ths.some(h => h.includes('ภาคเรียน'))) {
      gridTable = t
      return false
    }
  })

  return {
    page: 'regrade_requests',
    ...meta,
    requests: gridTable ? parseGridTable($, gridTable) : [],
  }
}
export function parsePP7Req(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  const contentText = $('#ctl00_PageContent_UpdatePanel1, .dBody').first().text().replace(/\s+/g, ' ').trim()
  return { page: 'pp7_cert_request', ...meta, contentText: contentText || null }
}
export function parsePP6(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  const years = $('select').filter((_, s) =>
    $(s).find('option').text().includes('2566') ||
    $(s).find('option').text().includes('2567')
  ).first().find('option').map((__, o) => $(o).text().trim()).get().filter(Boolean)

  const terms = $('select').filter((_, s) => {
    const opts = $(s).find('option').map((__, o) => $(o).text().trim()).get()
    return opts.some(o => o === '1' || o === '2')
  }).first().find('option').map((__, o) => $(o).text().trim()).get().filter(Boolean)

  return { page: 'pp6', ...meta, availableYears: years, availableTerms: terms }
}
export function parsePP1(html) {
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)

  const languageOptions = []
  $('input[type="radio"]').each((_, el) => {
    const label = $(el).closest('td').text().trim() ||
      $(el).next('label').text().trim() ||
      $(el).attr('value') || ''
    if (label) languageOptions.push(label)
  })

  return { page: 'pp1', ...meta, languageOptions: [...new Set(languageOptions)] }
}

// router
const PARSERS = [
  { match: p => p.includes('tblstudentsinfo'), fn: parseTblStudentsInfo },
  { match: p => p.includes('tblstudents/show'), fn: parseTblStudents },
  { match: p => p.includes('tblstudents/email'), fn: parseTblStudentsEmail },
  { match: p => p.includes('transcriptsattend'), fn: parseTranscriptsAttend },
  { match: p => p.includes('transscoresub'), fn: parseTransScoreSub },
  { match: p => p.includes('election') || p.includes('elective'), fn: parseSubjectsElection },
  { match: p => p.includes('regradereq'), fn: parseReGradeReq },
  { match: p => p.includes('pp7'), fn: parsePP7Req },
  { match: p => p.includes('pp6'), fn: parsePP6 },
  { match: p => p.includes('pp1'), fn: parsePP1 },
]

/**@param {string} path @param {string} html @returns {object}*/
export function parseHTML(path, html) {
  const p = path.replace(/^\/sgss\//, '').toLowerCase()

  for (const { match, fn } of PARSERS)
    if (match(p)) return fn(html)

  // fallback
  const $ = cheerio.load(html)
  const meta = parsePageMeta($)
  const tables = []
  $('table').each((_, t) => {
    const rows = parseGridTable($, t)
    if (rows.length) tables.push(rows)
  })

  return { page: path, ...meta, tables }
}