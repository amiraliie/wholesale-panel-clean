const https = require('https');

fetch('https://dl.premiumcash.click:2053/Hajix/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'username=1&password=1',
  dispatcher: new (require('undici').Agent)({
    connect: { rejectUnauthorized: false }
  })
}).then(async res => {
  console.log('Login status:', res.status);
  const cookie = res.headers.get('set-cookie');
  console.log('Cookie:', cookie);
  
  const inbounds = await fetch('https://dl.premiumcash.click:2053/Hajix/panel/api/inbounds/list', {
    headers: { 'Cookie': cookie },
    dispatcher: new (require('undici').Agent)({ connect: { rejectUnauthorized: false } })
  });
  console.log('Inbounds status:', inbounds.status);
  const json = await inbounds.json();
  console.log('Inbounds:', JSON.stringify(json).substring(0, 500));
}).catch(console.error);
