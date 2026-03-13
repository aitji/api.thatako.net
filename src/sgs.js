import pkg from 'axios'
const axios = pkg
import * as cheerio from 'cheerio'
import * as qs from 'querystring'

// DEBUG: for save file
import fs from 'fs'
const DEBUG = true

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
                'Accept-Language': 'th,en-US;q=0.9,en;q=0.8'
            },
            maxRedirects: 5,
            validateStatus: () => true,
            // timeout: 15000
        })
    }

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
            .map(([name, value]) => `${name}=${value}`)
            .join('; ')
    }

    extractFormData(html) {
        const $ = cheerio.load(html)
        const formData = {}
        $('input[type="hidden"]').each((i, el) => {
            const name = $(el).attr('name')
            const value = $(el).attr('value') || ''
            if (name) formData[name] = value
        })
        return formData
    }

    async request(url, options = {}) {
        try {
            const response = await this.axiosInstance({
                url,
                method: options.method || 'GET',
                data: options.data,
                headers: {
                    'Cookie': this.getCookie(),
                    'Referer': this.baseURL,
                    ...options.headers
                },
                ...options.config
            })
            return response
        } catch (error) {
            if (DEBUG) throw new Error(`[error] ${options.method || 'GET'} ${url} failed: ${error.message}`)
            throw error
        }
    }

    async login(studentId, citizenId) {
        this.studentId = studentId
        this.citizenId = citizenId

        if (!this.studentId || this.studentId === 'xxxxx') throw new Error(`[error] client.login -> STUDENT_ID wasn't set`)
        if (!this.citizenId || this.citizenId === 'xxxxxxxxxxxx') throw new Error(`[error] client.login -> CITIZEN_ID wasn't set`)
        if (DEBUG) console.log(`[INFO] logging in as ${this.studentId}`)

        // [1] GET login page
        const pageRes = await this.request('/sgss/Security/SignIn.aspx')
        this.storeCookie(pageRes)

        if (DEBUG) {
            console.log('[DEBUG] Login page status:', pageRes.status)
            console.log('[DEBUG] Cookies after page load:', Object.keys(this.cookies))
        }

        // [2] extract form data
        const formData = this.extractFormData(pageRes.data)
        if (DEBUG) console.log('[DEBUG] Form fields found:', Object.keys(formData).length)

        // [3] prepare login data
        const postData = {
            ...formData,
            '__EVENTTARGET': '',
            '__EVENTARGUMENT': '',
            'ctl00$PageContent$UserName': this.studentId,
            'ctl00$PageContent$Password': this.citizenId,
            'ctl00$PageContent$RememberUserName': 'on',
            'ctl00$PageContent$RememberPassword': 'on',
            'ctl00$PageContent$OKButton$_Button': 'ตกลง'
        }

        if (DEBUG) console.log('[DEBUG] Submitting login...')

        // [4] login
        const res = await this.request('/sgss/Security/SignIn.aspx', {
            method: 'POST',
            data: qs.stringify(postData),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${this.baseURL}/sgss/Security/SignIn.aspx`
            },
            config: { maxRedirects: 5 }
        })

        this.storeCookie(res)

        if (DEBUG) {
            console.log('[DEBUG] Login response status:', res.status)
            console.log('[DEBUG] Has redirect location:', !!res.headers.location)
            console.log('[DEBUG] Cookies after login:', Object.keys(this.cookies))
        }

        // [5] is login succeeded
        if (res.status === 302 && res.headers.location) {
            if (DEBUG) console.log(`[INFO] logged in as ${this.studentId}`)

            const redirectUrl = res.headers.location
            if (DEBUG) console.log('[DEBUG] Following redirect to:', redirectUrl)

            const redirectRes = await this.request(redirectUrl)
            this.storeCookie(redirectRes)

            return true
        }

        const $ = cheerio.load(res.data)
        const errorMsg = $('#ctl00_PageContent_PasswordMessage').text().trim()
        if (errorMsg) throw new Error(`[error] Login failed: ${errorMsg}`)

        if (
            res.data.includes('ctl00$PageContent$UserName') &&
            res.data.includes('ctl00$PageContent$Password')
        ) {
            if (DEBUG) console.log('[DEBUG] Saved failed login page for inspection')
            throw new Error('[error] Login failed: Still on login page (credentials may be incorrect)')
        }

        if (res.status === 200) {
            if (DEBUG) console.log(`[INFO] logged in as ${this.studentId} (200 response)`)
            return true
        }

        throw new Error(`[error] Login failed with unexpected status: ${res.status}`)
    }

    async logout() {
        try {
            await this.request('/sgss/Security/SignOut.aspx')
            if (DEBUG) console.log('[INFO] logged out from sgs!')
        } catch (error) { console.error('[error] logout error:', error.message) }
    }

    /**
     * FETCH user information from SGS system
     * @param {"TblStudentsInfo/Show-TblStudentsInfo-Table.aspx" |
     *         "TblStudents/Show-TblStudents.aspx" |
     *         "TblStudents/Email-TblStudents.aspx" |
     *         "TblStudentsInfo/Show-TblStudentsInfo-Table.aspx" |
     *         "View_TranscriptsAttend/Show-View-TranscriptsAttend-Table.aspx" |
     *         "View_TransScoreSub/Show-View-TransScoreSub-Table.aspx" |
     *         "TblStudentElective/SubjectsElection.aspx" |
     *         "Reports/ReGradeReq.aspx" |
     *         "Reports/PP7Req.aspx" |
     *         "Reports/PP6.aspx" |
     *         "Reports/PP1.aspx"
     * } path - Path without /sgss/ prefix
     * @param {string} [label='data']
     */
    async getUserInfo(path, label = 'data') {
        if (DEBUG) console.log(`[INFO] fetching ${label}...`)

        const cleanPath = path.replace(/^\/sgss\//, '')
        const fullPath = `/sgss/${cleanPath}`

        const response = await this.request(fullPath)

        // is got redirected -> login? (session expired)
        if (response.data.includes('ctl00$PageContent$UserName') &&
            response.data.includes('Security/SignIn.aspx')) {
            throw new Error('[error] Session expired | got redirected to login page')
        }

        if (DEBUG) console.log(`[INFO] ${label} fetched!`)
        return response.data
    }

    /**
     * @param {11|12|21|22|31|32} semester - semester code (11, 12, 21, 22, 31, 32)
     * @returns {Promise<string>} HTML content with grades for the selected semester
     */
    async getGrades(semester) {
        const path = '/sgss/View_TransScoreSub/Show-View-TransScoreSub-Table.aspx'

        if (DEBUG) console.log(`[INFO] fetching grades for semester ${semester}...`)

        // [1] GET the initial page to extract form data
        const pageRes = await this.request(path)
        const formData = this.extractFormData(pageRes.data)

        // [2] prepare POST trigger the dropdown filter
        const postData = {
            ...formData,
            '__EVENTTARGET': 'ctl00$PageContent$ColTrFilter',
            '__EVENTARGUMENT': '',
            'ctl00$PageContent$ColTrFilter': semester
        }

        // [3] POST to trigger the filter
        const response = await this.request(path, {
            method: 'POST',
            data: qs.stringify(postData),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${this.baseURL}${path}`
            }
        })

        if (DEBUG) console.log(`[INFO] grades for semester ${semester} fetched!`)
        return response.data
    }

    /**
     * fetch grades for all semesters (11, 12, 21, 22, 31, 32)
     * @returns {Promise<Object>}
     */
    async getAllGrades() {
        const semesters = ['11', '12', '21', '22', '31', '32']
        const allGrades = {}

        if (DEBUG) console.log('[INFO] fetching grades for all semesters...')

        for (const semester of semesters) {
            try {
                const gradeData = await this.getGrades(semester)
                allGrades[semester] = gradeData

                await new Promise(resolve => setTimeout(resolve, 500))
            } catch (error) {
                console.error(`[error] failed fetch grades for semester ${semester}:`, error.message)
                allGrades[semester] = null
            }
        }

        if (DEBUG) console.log('[INFO] all grades fetched!')
        return allGrades
    }

    // DEBUG
    saveFile(filename, content) {
        const path = `${this.studentId}-${filename}`
        fs.writeFileSync(path, content)
        if (DEBUG) console.log(`[INFO] saved ${path}`)
    }
}

export default SGSClient