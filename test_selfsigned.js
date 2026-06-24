import { networkInterfaces } from 'os'
import selfsigned from 'selfsigned'

const ips = ['127.0.0.1']
const nets = networkInterfaces()
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
  }
}

const attrs = [{ name: 'commonName', value: ips[1] || 'localhost' }]
const pems = selfsigned.generate(attrs, {
  days: 365,
  keySize: 2048,
  extensions: [
    { name: 'basicConstraints', cA: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        ...ips.map(ip => ({ type: 7, ip }))
      ]
    }
  ]
})
console.log('Success!')
