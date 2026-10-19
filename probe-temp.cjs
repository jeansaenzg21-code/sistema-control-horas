const mysql = require('mysql2/promise');
const COLORES = ['#7651d4','#3f8ae0','#2fa98a','#c9743a','#b4508f','#5c8f2e','#8a6b2f','#4a72b8','#a05252','#4f8a8a'];
function colorDeCliente(id){ return COLORES[Math.abs(id) % COLORES.length]; }
function hexRGB(h){const n=parseInt(h.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];}
function dist(a,b){const A=hexRGB(a),B=hexRGB(b);return Math.sqrt(A.reduce((t,v,i)=>t+(v-B[i])**2,0));}
(async()=>{
  const c=await mysql.createConnection({host:'localhost',port:3306,user:'root',password:'MYSQL',database:'paredescano'});
  const [r]=await c.query("SELECT id, nombre, horas_contratadas FROM clientes WHERE activo=TRUE ORDER BY id");
  console.log('Clientes y su color asignado:\n');
  const usados=[];
  for(const x of r){
    const col=colorDeCliente(x.id);
    let min=Infinity,(vecino)=null;
    for(const p of usados){const d=dist(col,p.c);if(d<min){min=d;vecino=p.n;}}
    usados.push({c:col,n:x.nombre});
    console.log(String(x.id).padStart(4), x.nombre.slice(0,36).padEnd(38), col, vecino?`mas parecido a "${vecino}" (dist ${Math.round(min)})`:'(primero)');
  }
  // El mas parecido de todos los pares.
  let peor=Infinity, par=null;
  for(let i=0;i<usados.length;i++)for(let j=i+1;j<usados.length;j++){const d=dist(usados[i].c,usados[j].c);if(d<peor){peor=d;par=[usados[i],usados[j]];}}
  console.log('\nPar mas parecido:', par[0].n,'y',par[1].n,'-> distancia', Math.round(peor), peor<40?'(PELIGRO: casi iguales)':'(ok, distinguibles)');
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
