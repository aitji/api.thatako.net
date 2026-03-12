import SGSClient from "./sgs.js"
import "dotenv/config"

async function example() {
  const client = new SGSClient()
  const STUDENT_ID = process.env.STUDENT_ID
  const CITIZEN_ID = process.env.CITIZEN_ID
  if (!STUDENT_ID || !CITIZEN_ID) return console.error('STUDENT_ID and CITIZEN_ID are required')

  try {
    await client.login(STUDENT_ID, CITIZEN_ID)
    const info = await client.getUserInfo("TblStudents/Email-TblStudents.aspx")
    client.saveFile(`info.html`, info)

    await client.logout()
    console.log('\nAll done!')
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

example()
