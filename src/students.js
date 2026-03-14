import fs from "fs"
import "dotenv/config"

const base = process.env.URL
const token = process.env.TOKEN
const cookie = process.env.SESSION_COOKIE
const terms = ["เด็ก", "นาย", "นาง"]
const prefixes = ["เด็กชาย", "เด็กหญิง", "นางสาว", "นาง", "นาย"]
const isFancy = false

/**
@param {string} name
@return {{prefix:string,name:string}}
*/
const splitPrefix = name => {
    const p = prefixes.find(x => name.startsWith(x))
    return p ? { prefix: p, name: name.slice(p.length) } : { prefix: "", name }
}

/**
@param {string} cls
@return {{grade:number,room:number}}
*/
const parseClass = cls => {
    const m = cls.match(/ม\.(\d+)\/(\d+)/)
    return { grade: +m[1], room: +m[2] }
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
    /** @type {{id:number,prefix:string,name:string,grade:number,room:number,classRaw:string}[]} */
    const rows = []
    for (const t of terms) {
        console.log("grab:", t)

        const txt = (await search(t)).replace(")]}'", "").trim()
        const outer = JSON.parse(txt)
        const inner = JSON.parse(outer[0][1][1])

        for (const r of inner) {
            const { prefix, name } = splitPrefix(r[2])
            const { grade, room } = parseClass(r[0])

            rows.push({
                id: +r[1],
                prefix,
                name,
                grade,
                room,
                classRaw: r[0]
            })
        }
    }

    rows.sort((a, b) =>
        a.grade - b.grade ||
        a.room - b.room ||
        a.id - b.id
    )

    const json = {
        total: rows.length,
        students: rows.map(({ id, prefix, name, grade, room }) => ({
            id, prefix, name, class: grade, room
        }))
    }

    let csv = "ชั้น,ชื่อ-นามสกุล,รหัสนักเรียน\n"
    for (const r of rows) {
        csv += `ม.${r.grade}/${r.room},${r.prefix}${r.name},${r.id}\n`
    }

    if (isFancy) {
        const fancy = { total: rows.length }

        for (const r of rows) {
            const gKey = `m${r.grade}`
            const cKey = `class${r.room}`

            let g = fancy[gKey]
            if (!g) g = fancy[gKey] = { total: 0 }

            let c = g[cKey]
            if (!c) c = g[cKey] = { total: 0, students: [] }

            g.total++
            c.total++

            c.students.push({
                id: r.id,
                prefix: r.prefix,
                name: r.name
            })
        }

        fs.writeFileSync("../data/fancy_students.json", JSON.stringify(fancy, null, 2))
    }

    fs.writeFileSync("../data/students.json", JSON.stringify(json, null, 2)) // use for api
    fs.writeFileSync("../data/students.csv", csv)
    console.log("done:", rows.length)
})()