import https from 'https'
import express from 'express'
import fs from 'fs'

const app = express()
app.get('/', (req, res) => res.send('ok'))

const privateKey = fs.readFileSync('key.pem', 'utf8')
const certificate = fs.readFileSync('cert.pem', 'utf8')

https.createServer({ key: privateKey, cert: certificate }, app).listen(3211, () => {
  console.log('Server started')
})
