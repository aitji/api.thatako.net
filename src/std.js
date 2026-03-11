import fs from "fs"
import "dotenv/config"

const base = process.env.URL
const token = process.env.TOKEN
const cookie = process.env.SESSION_COOKIE
const terms = ["เด็ก", "นาย", "นาง"]

const classKey = c => {
    const m = c.match(/ม\.(\d+)\/(\d+)/)
    return [+m[1], +m[2]]
}

/**
@param {string} term
@return {Promise<string>}
*/
const search = async term => {
    const payload = JSON.stringify([
        "searchData",
        JSON.stringify([term]),
        null, [0],
        null, null,
        1, 0
    ])

    const url = `${base}/callback?nocache_id=${Date.now()}&token=${token}`

    const r = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded;charset=utf-8",
            cookie,
            "x-same-domain": "1"
        },
        body: "request=" + encodeURIComponent(payload)
    })

    return r.text()
}

(async () => {
    const rows = []
    for (const t of terms) {
        console.log("grab:", t)

        const txt = (await search(t)).replace(")]}'", "").trim()
        const outer = JSON.parse(txt)
        const inner = JSON.parse(outer[0][1][1])

        for (const r of inner) rows.push({
            class: r[0],
            id: +r[1],
            name: r[2]
        })
    }

    rows.sort((a, b) => {
        const [ga, sa] = classKey(a.class)
        const [gb, sb] = classKey(b.class)
        return ga - gb || sa - sb || a.id - b.id
    })

    const json = {
        total: rows.length,
        students: rows
    }

    let csv = "ชั้น,ชื่อ-นามสกุล,รหัสนักเรียน\n"
    for (const r of rows) {
        csv += `${r.class},${r.name},${r.id}\n`
    }

    const fancy = { total: rows.length }

    for (const r of rows) {
        const [gradeRaw, classNum] = r.class.split("/")
        const gradeKey = gradeRaw.replace(".", "").toLowerCase() // ม.1 -> ม1
        const classKey = `class${classNum}`

        if (!fancy[gradeKey]) fancy[gradeKey] = { total: 0 }
        if (!fancy[gradeKey][classKey]) {
            fancy[gradeKey][classKey] = { total: 0, students: [] }
        }

        fancy[gradeKey].total++
        fancy[gradeKey][classKey].total++
        fancy[gradeKey][classKey].students.push(r)
    }

    fs.writeFileSync("../data/fancy_students.json", JSON.stringify(fancy, null, 2))
    fs.writeFileSync("../data/students.json", JSON.stringify(json, null, 2))
    fs.writeFileSync("../data/students.csv", csv)
    console.log("done:", rows.length)
})()