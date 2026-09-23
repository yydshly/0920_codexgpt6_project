import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.vrm':'model/gltf-binary','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const info=await stat(file);if(!info.isFile())throw new Error('not file');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
