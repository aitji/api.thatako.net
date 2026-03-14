import pkg from 'axios'
const axios = pkg
import * as cheerio from 'cheerio'
import * as qs from 'querystring'
import fs from 'fs'
import path from 'path'
import { parseHTML } from './sgs-parser.js'

// DEBUG: for save file
const DEBUG = true

export const FILE_TO_PATH_MAP = {
  // info pages
  'TblStudentsInfo-Show-TblStudentsInfo-Table_aspx':
    'TblStudentsInfo/Show-TblStudentsInfo-Table.aspx',
  'TblStudents-Show-TblStudents_aspx':
    'TblStudents/Show-TblStudents.aspx',
  'TblStudents-Email-TblStudents_aspx':
    'TblStudents/Email-TblStudents.aspx',
  'View_TranscriptsAttend-Show-View-TranscriptsAttend-Table_aspx':
    'View_TranscriptsAttend/Show-View-TranscriptsAttend-Table.aspx',
  'View_TransScoreSub-Show-View-TransScoreSub-Table_aspx':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'TblStudentElective-SubjectsElection_aspx':
    'TblStudentElective/SubjectsElection.aspx',
  'Reports-ReGradeReq_aspx':
    'Reports/ReGradeReq.aspx',
  'Reports-PP7Req_aspx':
    'Reports/PP7Req.aspx',
  'Reports-PP6_aspx':
    'Reports/PP6.aspx',
  'Reports-PP1_aspx':
    'Reports/PP1.aspx',

  // grade pages (per-semester)
  'grades-11':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'grades-12':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'grades-21':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'grades-22':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'grades-31':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'grades-32':
    'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
}

class SGSClient {
  constructor() {
    this.baseURL = 'https://sgs.bopp-obec.info'
    this.cookies = {}
    this.studentId = ''
    this.citizenId = ''
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th,en-US;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
      validateStatus: () => true,
    })
  }

  // cookie helpers
  storeCookie(res) {
    const setCookie = res.headers['set-cookie']
    if (!setCookie) return
    setCookie.forEach(cookie => {
      const [raw] = cookie.split(';')
      const [name, value] = raw.split('=')
      this.cookies[name] = value
    })
  }

  getCookie() {
    return Object.entries(this.cookies)
      .map(([n, v]) => `${n}=${v}`)
      .join('; ')
  }

  // form helpers
  extractFormData(html) {
    const $ = cheerio.load(html)
    const formData = {}
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name')
      const value = $(el).attr('value') || ''
      if (name) formData[name] = value
    })
    return formData
  }

  // low-level request
  async request(url, options = {}) {
    try {
      return await this.axiosInstance({
        url,
        method: options.method || 'GET',
        data: options.data,
        headers: {
          Cookie: this.getCookie(),
          Referer: this.baseURL,
          ...options.headers,
        },
        ...options.config,
      })
    } catch (error) {
      throw new Error(`[error] ${options.method || 'GET'} ${url} failed: ${error.message}`)
    }
  }

  // auth
  async login(studentId, citizenId) {
    this.studentId = studentId
    this.citizenId = citizenId
    if (DEBUG) console.log(`[INFO] logging in as ${studentId}`)

    const pageRes = await this.request('/sgss/Security/SignIn.aspx')
    this.storeCookie(pageRes)

    const formData = this.extractFormData(pageRes.data)
    const postData = {
      ...formData,
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      'ctl00$PageContent$UserName': studentId,
      'ctl00$PageContent$Password': citizenId,
      'ctl00$PageContent$RememberUserName': 'on',
      'ctl00$PageContent$RememberPassword': 'on',
      'ctl00$PageContent$OKButton$_Button': 'ตกลง',
    }

    const res = await this.request('/sgss/Security/SignIn.aspx', {
      method: 'POST',
      data: qs.stringify(postData),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.baseURL}/sgss/Security/SignIn.aspx`,
      },
      config: { maxRedirects: 5 },
    })
    this.storeCookie(res)

    if (res.status === 302 && res.headers.location) {
      const redir = await this.request(res.headers.location)
      this.storeCookie(redir)
      if (DEBUG) console.log(`[INFO] logged in as ${studentId}`)
      return true
    }

    const $ = cheerio.load(res.data)
    const err = $('#ctl00_PageContent_PasswordMessage').text().trim()
    if (err) throw new Error(`[error] Login failed: ${err}`)

    if (res.data.includes('ctl00$PageContent$UserName'))
      throw new Error('[error] Login failed: still on login page (wrong credentials?)')

    if (DEBUG) console.log(`[INFO] logged in as ${studentId} (200)`)
    return true
  }

  async logout() {
    try {
      await this.request('/sgss/Security/SignOut.aspx')
      if (DEBUG) console.log('[INFO] logged out from sgs!')
    } catch (e) {
      console.error('[error] logout:', e.message)
    }
  }

  // page fetchers ; live
  async getUserInfoHTML(sgsPath, label = 'data') {
    if (DEBUG) console.log(`[INFO] fetching HTML: ${label}...`)
    const cleanPath = sgsPath.replace(/^\/sgss\//, '')
    const res = await this.request(`/sgss/${cleanPath}`)

    if (res.data.includes('ctl00$PageContent$UserName') &&
      res.data.includes('Security/SignIn.aspx'))
      throw new Error('[error] Session expired ; redirected to login')

    if (DEBUG) console.log(`[INFO] ${label} fetched!`)
    return res.data
  }
  async getUserInfo(sgsPath, label = 'data') {
    const html = await this.getUserInfoHTML(sgsPath, label)
    return parseHTML(sgsPath, html)
  }
  /**@param {'11'|'12'|'21'|'22'|'31'|'32'} semester*/
  async getGrades(semester) {
    const sgsPath = '/sgss/View_TransScoreSub/Show-View-TransScoreSub-Table.aspx'
    if (DEBUG) console.log(`[INFO] fetching grades for semester ${semester}...`)

    const pageRes = await this.request(sgsPath)
    const formData = this.extractFormData(pageRes.data)

    const postData = {
      ...formData,
      __EVENTTARGET: 'ctl00$PageContent$ColTrFilter',
      __EVENTARGUMENT: '',
      'ctl00$PageContent$ColTrFilter': semester,
    }

    const res = await this.request(sgsPath, {
      method: 'POST',
      data: qs.stringify(postData),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.baseURL}${sgsPath}`,
      },
    })

    if (DEBUG) console.log(`[INFO] grades semester ${semester} fetched!`)
    return { ...parseHTML(sgsPath, res.data), semesterValue: semester }
  }
  async getAllGrades() {
    const semesters = ['11', '12', '21', '22', '31', '32']
    const allGrades = {}
    if (DEBUG) console.log('[INFO] fetching grades for all semesters...')

    for (const sem of semesters) {
      try {
        allGrades[sem] = await this.getGrades(sem)
        await new Promise(r => setTimeout(r, 500))
      } catch (e) {
        console.error(`[error] grades ${sem}:`, e.message)
        allGrades[sem] = null
      }
    }

    if (DEBUG) console.log('[INFO] all grades fetched!')
    return allGrades
  }

  // local file helpers
  saveFile(filename, content) {
    const out = `${this.studentId}-${filename}`
    fs.writeFileSync(out, content)
    if (DEBUG) console.log(`[INFO] saved ${out}`)
  }
  saveJSON(filename, data) {
    const out = `${this.studentId}-${filename}`
    fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf8')
    if (DEBUG) console.log(`[INFO] saved ${out}`)
  }

  /**@param {string} filePath @param {string} [sgsPath] @returns {object}*/
  static parseLocalFile(filePath, sgsPath) {
    const html = fs.readFileSync(filePath, 'utf8')

    if (!sgsPath) {
      let basename = path.basename(filePath)
        .replace(/\.html$/i, '')
        .replace(/\.aspx$/i, '_aspx')
        .replace(/^\d+-info-/, '')
      const stem = basename
      sgsPath = FILE_TO_PATH_MAP[stem] || stem
      if (DEBUG && FILE_TO_PATH_MAP[stem]) console.log(`[INFO] resolved "${stem}" → "${sgsPath}"`)
      else if (DEBUG) console.warn(`[WARN] no mapping for stem "${stem}", falling back to generic parser`)
    }

    return parseHTML(sgsPath, html)
  }

  /**@param {string} dir @param {string} studentId @param {string} outputDir @returns {Record<string, object>}*/
  static parseAllLocalFiles(dir = '.', studentId = '', outputDir = null) {
    outputDir = outputDir || dir
    const prefix = studentId ? `${studentId}-info-` : ''
    const pattern = new RegExp(`^${prefix}(.+)\\.html$`)
    const results = {}

    const files = fs.readdirSync(dir).filter(f => pattern.test(f))
    for (const file of files) {
      const stem = file
        .replace(/\.html$/i, '')
        .replace(/\.aspx$/i, '_aspx')
        .replace(/^\d+-info-/, '')
      try {
        const json = SGSClient.parseLocalFile(path.join(dir, file))
        results[stem] = json

        const outName = path.join(outputDir, `${studentId ? studentId + '-' : ''}${stem}.json`)
        fs.writeFileSync(outName, JSON.stringify(json, null, 2), 'utf8')
        if (DEBUG) console.log(`✓ parsed & saved ${file} → ${path.basename(outName)}`)
      } catch (e) {
        console.error(`✗ ${file}:`, e.message)
        results[stem] = null
      }
    }
    return results
  }
}

export default SGSClient