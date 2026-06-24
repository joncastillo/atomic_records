import https from 'https'
import express from 'express'
import fs from 'fs'
import { execSync } from 'child_process'

const app = express()
app.get('/', (req, res) => res.send('ok'))

try {
  if (!fs.existsSync('key.pem')) {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=192.168.50.199" -addext "subjectAltName=IP:192.168.50.199"`)
  }
  const privateKey = fs.readFileSync('key.pem', 'utf8')
  const certificate = fs.readFileSync('cert.pem', 'utf8')

  https.createServer({ key: privateKey, cert: certificate }, app).listen(3211, () => {
    console.log('Server started')
  })
} catch (e) {
  console.log(e)
}
