const https = require('https');
https.get('https://veltro-casino.onrender.com', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const jsFiles = [...data.matchAll(/_next\/static\/chunks\/[^"']+\.js/g)].map(m => m[0]);
    console.log('Found JS files:', jsFiles.length);
    let found = false;
    let checked = 0;
    jsFiles.forEach(js => {
      https.get('https://veltro-casino.onrender.com/' + js, (r) => {
        let jData = '';
        r.on('data', d => jData += d);
        r.on('end', () => {
          checked++;
          if (jData.includes('DUmdbgs')) {
            console.log('FOUND OLD ADDRESS IN:', js);
            found = true;
          }
          if (checked === jsFiles.length) {
             if (!found) console.log('Not found in any chunk on the live site');
          }
        });
      }).on('error', (e) => console.log(e));
    });
  });
}).on('error', (e) => console.log(e));
