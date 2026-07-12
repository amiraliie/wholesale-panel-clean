process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

fetch('https://dl.premiumcash.click:2053/Hajix/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'username=1&password=1'
}).then(async res => {
  const cookie = res.headers.get('set-cookie');
  console.log('Login Cookie:', cookie ? 'Received' : 'None');
  
  const inbounds = await fetch('https://dl.premiumcash.click:2053/Hajix/panel/api/inbounds/list', {
    headers: { 'Cookie': cookie }
  });
  console.log('Inbounds status:', inbounds.status);
  const json = await inbounds.json();
  
  // also get server status
  const statusRes = await fetch('https://dl.premiumcash.click:2053/Hajix/server/status', {
    headers: { 'Cookie': cookie, 'Accept': 'application/json' }
  });
  console.log('Server status code:', statusRes.status);
  
  if(Array.isArray(json.obj)) {
    console.log('First inbound id:', json.obj[0].id);
    console.log('First inbound remark:', json.obj[0].remark);
    console.log('First inbound settings:', json.obj[0].settings);
    console.log('First inbound clientStats length:', json.obj[0].clientStats ? json.obj[0].clientStats.length : 0);
  } else {
      console.log(json);
  }
}).catch(console.error);
