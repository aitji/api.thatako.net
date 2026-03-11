# api.thatako.net
i will write `readme` later... rn it just `dev`

## install
`node js` and install `dotenv`

```js
npm install dotenv
```

## todo

### gathering the reources
priority this
- [x] students data
- [ ] sgs json return
- [ ] port my old sgs gathering, to more light weight

### api
need data first
- [ ] landing place `api.thatako.net`
- [ ] api.thatako.net/`v1`/`students`
- [ ] api.thatako.net/`v1`/`sgs`

s## .env
where to find data for `.env`?
> f12 -> network -> search -> (filiter with xhr) -> first one
it will be in this structure:

```js
await fetch("{process.env.URL}/callback?nocache_id=6&token={process.env.TOKEN}", {
    "credentials": "include",
    "headers": {
        "User-Agent": "...", "Accept": "...",
        "Accept-Language": "en-US,en;q=0.9", "X-Same-Domain": "1",
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "Sec-GPC": "1", "Alt-Used": "script.google.com",
        "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
    },
    "referrer": "{process.env.URL}/exec",
    "body": "request=...",
    "method": "POST",
    "mode": "cors"
});
```

{process.env.SESSION_COOKIE}? run this command

```js
copy(document.cookie)
```
> and use it inside `.env` file
