import SGSClient from "./sgs.js"
import "dotenv/config"

async function example() {
  const client = new SGSClient()
  const STUDENT_ID = process.env.STUDENT_ID
  const CITIZEN_ID = process.env.CITIZEN_ID
  if (!STUDENT_ID || !CITIZEN_ID) return console.error('STUDENT_ID and CITIZEN_ID are required')

  try {
    await client.login(STUDENT_ID, CITIZEN_ID)

    const allInfo = [
      "TblStudentsInfo/Show-TblStudentsInfo-Table.aspx",
      "TblStudents/Show-TblStudents.aspx",
      "TblStudents/Email-TblStudents.aspx",
      "TblStudentsInfo/Show-TblStudentsInfo-Table.aspx",
      "View_TranscriptsAttend/Show-View-TranscriptsAttend-Table.aspx",
      "View_TransScoreSub/Show-View-TransScoreSub-Table.aspx",
      "TblStudentElective/SubjectsElection.aspx",
      "Reports/ReGradeReq.aspx",
      "Reports/PP7Req.aspx",
      "Reports/PP6.aspx",
      "Reports/PP1.aspx"
    ]
    for (const index of allInfo) {
      const info = await client.getUserInfo(index)
      client.saveFile(`info-${index.replaceAll('/', '-')}.html`, info)
    }

    //grade
    const allGrades = await client.getAllGrades()
    for (const [semester, gradeData] of Object.entries(allGrades)) {
      if (gradeData) client.saveFile(`info-grades-${semester}.html`, gradeData)
      else console.log(`[WARN] no grade data for semester ${semester}`)
    }

    await client.logout()
    console.log('\nAll done!')
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

example()
