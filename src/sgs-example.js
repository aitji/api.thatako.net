import SGSClient, { FILE_TO_PATH_MAP } from './sgs.js'
import 'dotenv/config'

// helper
const ALL_INFO_PATHS = [
  'TblStudentsInfo/Show-TblStudentsInfo-Table.aspx',
  'TblStudents/Show-TblStudents.aspx',
  'TblStudents/Email-TblStudents.aspx',
  'View_TranscriptsAttend/Show-View-TranscriptsAttend-Table.aspx',
  'View_TransScoreSub/Show-View-TransScoreSub-Table.aspx',
  'TblStudentElective/SubjectsElection.aspx',
  'Reports/ReGradeReq.aspx',
  'Reports/PP7Req.aspx',
  'Reports/PP6.aspx',
  'Reports/PP1.aspx',
]
const pathToStem = (p) => p.replace(/\//g, '-').replace(/\.aspx$/, '')

// process local files
function parseAllLocalFiles() {
  console.log('\n---------- parsing JSON ----------\n')

  const STUDENT_ID = process.env.STUDENT_ID
  const allResults = SGSClient.parseAllLocalFiles('.', STUDENT_ID)

  // quick summary
  console.log('\n---------- summary ----------')
  for (const [stem, json] of Object.entries(allResults)) {
    if (!json) {
      console.warn(`  [!] ${stem}: failed`)
      continue
    }

    // simple overview
    switch (json.page) {
      case 'grades':
        console.log(`  [/] ${stem}: ${json.subjects?.length ?? 0} subjects, GPA=${json.gpa ?? 'n/a'}, sem=${json.semesterValue}`)
        break
      case 'student_profile':
        console.log(`  [/] ${stem}: ${json.profile?.['ชื่อ']} ${json.profile?.['นามสกุล']}, id=${json.profile?.['เลขประจำตัวนักเรียน']}`)
        break
      case 'attendance':
        console.log(`  [/] ${stem}: ${json.records?.length ?? 0} absence record(s)`)
        break
      case 'elective_subjects':
        console.log(`  [/] ${stem}: ${json.selectedSubjects?.length ?? 0} selected, ${json.availableSubjects?.length ?? 0} available`)
        break
      default:
        console.log(`  [/] ${stem}: page="${json.page}"`)
    }
  }
}

// live fetch with SGS
async function liveFetch() {
  const STUDENT_ID = process.env.STUDENT_ID
  const CITIZEN_ID = process.env.CITIZEN_ID

  if (!STUDENT_ID || !CITIZEN_ID) {
    console.error('STUDENT_ID and CITIZEN_ID are required in .env')
    process.exit(1)
  }

  const client = new SGSClient()
  client.studentId = STUDENT_ID // NEED for "saveJSON/saveFile" prefixing

  try {
    await client.login(STUDENT_ID, CITIZEN_ID)

    // fetch info pages
    console.log('\n---------- fetching info pages ----------')

    for (const sgsPath of ALL_INFO_PATHS) {
      const stem = pathToStem(sgsPath)
      try {
        // fetch raw HTML ; (you may remove this)
        // useful to keep for offline re-parsing later ;p
        const html = await client.getUserInfoHTML(sgsPath, stem)
        client.saveFile(`info-${stem}.html`, html)

        // parse the HTML ; JSON and save
        // parseHTML() is re-used here via getUserInfo() which calls it internally
        const json = await client.getUserInfo(sgsPath, stem)
        client.saveJSON(`${stem}.json`, json)

        console.log(`[/] ${stem}:`, JSON.stringify(json).slice(0, 120), '...')
      } catch (err) { console.error(`[!] ${stem}:`, err.message) }

      await new Promise(r => setTimeout(r, 300))
    }

    // get grade
    console.log('\n---------- Fetching Grades ----------')

    const allGrades = {}
    for (const semester of ['11', '12', '21', '22', '31', '32']) {
      try {
        // getGrades() posts grade page and returns parsed JSON
        const gradeJSON = await client.getGrades(semester)
        allGrades[semester] = gradeJSON

        client.saveJSON(`grades-${semester}.json`, gradeJSON)
        console.log(`[/] semester ${semester}: ${gradeJSON.subjects?.length ?? 0} subject(s)`)
      } catch (err) {
        console.error(`[!] semester ${semester}:`, err.message)
        allGrades[semester] = null
      }

      await new Promise(r => setTimeout(r, 500))
    }

    client.saveJSON('grades-all.json', allGrades)

    await client.logout()
    console.log('\n[/] All done!')

  } catch (error) {
    console.error('[!] Fatal error:', error.message)
    process.exit(1)
  }
}

// entry point ----------------------------------------------------------- //
// no need to login BUT need file tho (requires ".env" with STUDENT_ID)
// parseAllLocalFiles()

// ----------------------------------------------------------------------- //
// fetch from SGS (requires ".env" with STUDENT_ID + CITIZEN_ID)
// liveFetch()