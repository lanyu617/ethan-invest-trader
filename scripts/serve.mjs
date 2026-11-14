/** Minimal static development server. Do not use as an internet-facing production server. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site');
const port=Number(process.env.PORT ?? 4173);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://localhost');
    let resource=decodeURIComponent(url.pathname);if(resource.endsWith('/'))resource+='index.html';
    const file=path.resolve(root,'.'+resource);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log(`ETHAN INVEST TRADER development server: http://localhost:${port}\nLocalhost supports PWA testing. Use HTTPS hosting for phone installation.`));
