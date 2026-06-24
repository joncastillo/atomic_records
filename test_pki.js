import { execSync } from 'child_process'
import fs from 'fs'

try {
  execSync(`openssl req -x509 -sha256 -newkey rsa:2048 -keyout rootCA.key -out rootCA.pem -days 3650 -nodes -subj "/CN=Atomic Records Local CA" -addext "basicConstraints=critical,CA:TRUE"`)
  execSync(`openssl req -new -newkey rsa:2048 -keyout key.pem -out server.csr -nodes -subj "/CN=192.168.50.199"`)
  fs.writeFileSync('leaf.ext', `basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\nsubjectAltName=IP:192.168.50.199\n`)
  execSync(`openssl x509 -req -in server.csr -CA rootCA.pem -CAkey rootCA.key -CAcreateserial -out cert.pem -days 365 -sha256 -extfile leaf.ext`)
  console.log('Success!')
} catch (e) {
  console.error('Failed!', e)
}
