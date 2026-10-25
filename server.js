const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'schoolos.db'));

db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schools (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'admin',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,admission_no TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,gender TEXT,class_name TEXT,parent_name TEXT,parent_phone TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(school_id,admission_no),FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS teachers (id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL,email TEXT,phone TEXT,subject TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,student_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('present','absent','late')),UNIQUE(student_id,attendance_date),FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE,FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS fees (id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,student_id INTEGER NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),purpose TEXT NOT NULL,reference TEXT NOT NULL,paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE,FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE);
`);

const send = (res, status, data, headers={}) => { const body = JSON.stringify(data); res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}); res.end(body); };
const redirect = (res, location) => { res.writeHead(302,{Location:location}); res.end(); };
function parseCookies(req){const out={};for(const part of (req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}return out}
function setCookie(res,name,value,maxAge=604800){res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`)}
function token(){return crypto.randomBytes(32).toString('hex')}
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');return `${salt}:${hash}`}
function verifyPassword(password,stored){const [salt,hash]=stored.split(':');const derived=crypto.scryptSync(password,salt,64).toString('hex');return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(derived,'hex'))}
function currentUser(req){const t=parseCookies(req).schoolos_session;if(!t)return null;const row=db.prepare(`SELECT s.token,s.expires_at,u.id user_id,u.name,u.email,u.role,u.school_id,sc.name school_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN schools sc ON sc.id=u.school_id WHERE s.token=?`).get(t);if(!row)return null;if(row.expires_at<Date.now()){db.prepare('DELETE FROM sessions WHERE token=?').run(t);return null}return row}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
function auth(req,res){const user=currentUser(req);if(!user){send(res,401,{error:'Authentication required.'});return null}return user}
function required(o,fields){return fields.filter(f=>!String(o[f]??'').trim())}
function today(){return new Date().toISOString().slice(0,10)}

async function api(req,res,url,user){
  const parts=url.pathname.split('/').filter(Boolean); const route=parts.slice(1).join('/');
  if(route==='auth/register'&&req.method==='POST'){
    const b=await body(req);const missing=required(b,['schoolName','name','email','password']);if(missing.length)return send(res,400,{error:`Missing: ${missing.join(', ')}`});if(String(b.password).length<6)return send(res,400,{error:'Password must be at least 6 characters.'});
    const email=String(b.email).trim().toLowerCase();try{db.exec('BEGIN');const s=db.prepare('INSERT INTO schools(name) VALUES(?)').run(String(b.schoolName).trim());const u=db.prepare('INSERT INTO users(school_id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(s.lastInsertRowid,String(b.name).trim(),email,hashPassword(b.password),'admin');db.exec('COMMIT');const t=token();db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(t,u.lastInsertRowid,Date.now()+604800000);setCookie(res,'schoolos_session',t);return send(res,201,{message:'School account created.',redirect:'/dashboard.html'})}catch(e){try{db.exec('ROLLBACK')}catch{};if(String(e.message).includes('UNIQUE'))return send(res,409,{error:'That email is already registered.'});console.error(e);return send(res,500,{error:'Could not create account.'})}
  }
  if(route==='auth/login'&&req.method==='POST'){
    const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!u||!verifyPassword(password,u.password_hash))return send(res,401,{error:'Invalid email or password.'});const t=token();db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(t,u.id,Date.now()+604800000);setCookie(res,'schoolos_session',t);return send(res,200,{message:'Login successful.',redirect:'/dashboard.html'});
  }
  if(route==='auth/logout'&&req.method==='POST'){const t=parseCookies(req).schoolos_session;if(t)db.prepare('DELETE FROM sessions WHERE token=?').run(t);setCookie(res,'schoolos_session','',0);return send(res,200,{message:'Logged out.'})}
  if(route==='auth/me'&&req.method==='GET'){if(!user)return send(res,401,{error:'Authentication required.'});const {token:_,...safeUser}=user;return send(res,200,{user:safeUser})}
  if(!user)return send(res,401,{error:'Authentication required.'});
  const sid=user.school_id;
  if(route==='dashboard'&&req.method==='GET'){
    const students=db.prepare('SELECT COUNT(*) count FROM students WHERE school_id=?').get(sid).count;const teachers=db.prepare('SELECT COUNT(*) count FROM teachers WHERE school_id=?').get(sid).count;const fees=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM fees WHERE school_id=?').get(sid).total;const a=db.prepare(`SELECT COALESCE(SUM(CASE WHEN status='present' THEN 1 ELSE 0 END),0) present,COUNT(*) total FROM attendance WHERE school_id=? AND attendance_date=?`).get(sid,today());const attendanceRate=a.total?Math.round(a.present/a.total*100):0;const recentFees=db.prepare(`SELECT f.id,f.amount,f.purpose,f.reference,f.paid_at,s.first_name||' '||s.last_name student_name FROM fees f JOIN students s ON s.id=f.student_id WHERE f.school_id=? ORDER BY f.id DESC LIMIT 8`).all(sid);return send(res,200,{stats:{students,teachers,fees,attendanceRate},recentFees,today:today()});
  }
  if(route==='students'&&req.method==='GET')return send(res,200,db.prepare('SELECT * FROM students WHERE school_id=? ORDER BY id DESC').all(sid));
  if(route==='students'&&req.method==='POST'){const b=await body(req);const m=required(b,['admissionNo','firstName','lastName']);if(m.length)return send(res,400,{error:`Missing: ${m.join(', ')}`});try{const r=db.prepare(`INSERT INTO students(school_id,admission_no,first_name,last_name,gender,class_name,parent_name,parent_phone) VALUES(?,?,?,?,?,?,?,?)`).run(sid,b.admissionNo.trim(),b.firstName.trim(),b.lastName.trim(),b.gender||'',b.className||'',b.parentName||'',b.parentPhone||'');return send(res,201,db.prepare('SELECT * FROM students WHERE id=?').get(r.lastInsertRowid))}catch{return send(res,409,{error:'Admission number already exists in this school.'})}}
  if(parts[1]==='students'&&parts[2]&&req.method==='DELETE'){const r=db.prepare('DELETE FROM students WHERE id=? AND school_id=?').run(parts[2],sid);return r.changes?send(res,200,{message:'Student deleted.'}):send(res,404,{error:'Student not found.'})}
  if(route==='teachers'&&req.method==='GET')return send(res,200,db.prepare('SELECT * FROM teachers WHERE school_id=? ORDER BY id DESC').all(sid));
  if(route==='teachers'&&req.method==='POST'){const b=await body(req);if(!String(b.name||'').trim())return send(res,400,{error:'Teacher name is required.'});const r=db.prepare('INSERT INTO teachers(school_id,name,email,phone,subject) VALUES(?,?,?,?,?)').run(sid,b.name.trim(),b.email||'',b.phone||'',b.subject||'');return send(res,201,db.prepare('SELECT * FROM teachers WHERE id=?').get(r.lastInsertRowid))}
  if(parts[1]==='teachers'&&parts[2]&&req.method==='DELETE'){const r=db.prepare('DELETE FROM teachers WHERE id=? AND school_id=?').run(parts[2],sid);return r.changes?send(res,200,{message:'Teacher deleted.'}):send(res,404,{error:'Teacher not found.'})}
  if(route==='attendance'&&req.method==='GET'){const date=url.searchParams.get('date')||today();const rows=db.prepare(`SELECT s.id,s.admission_no,s.first_name,s.last_name,s.class_name,COALESCE(a.status,'present') status FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=? WHERE s.school_id=? ORDER BY s.first_name,s.last_name`).all(date,sid);return send(res,200,{date,students:rows})}
  if(route==='attendance'&&req.method==='POST'){const b=await body(req);if(!b.studentId||!b.date||!['present','absent','late'].includes(b.status))return send(res,400,{error:'Student, date and valid status are required.'});const st=db.prepare('SELECT id FROM students WHERE id=? AND school_id=?').get(b.studentId,sid);if(!st)return send(res,404,{error:'Student not found.'});db.prepare(`INSERT INTO attendance(school_id,student_id,attendance_date,status) VALUES(?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status`).run(sid,b.studentId,b.date,b.status);return send(res,200,{message:'Attendance saved.'})}
  if(route==='fees'&&req.method==='GET')return send(res,200,db.prepare(`SELECT f.*,s.first_name||' '||s.last_name student_name,s.admission_no FROM fees f JOIN students s ON s.id=f.student_id WHERE f.school_id=? ORDER BY f.id DESC`).all(sid));
  if(route==='fees'&&req.method==='POST'){const b=await body(req),amount=Number(b.amount);if(!b.studentId||!Number.isFinite(amount)||amount<=0||!String(b.purpose||'').trim())return send(res,400,{error:'Student, amount and purpose are required.'});const st=db.prepare('SELECT id FROM students WHERE id=? AND school_id=?').get(b.studentId,sid);if(!st)return send(res,404,{error:'Student not found.'});const ref=`FEE-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;const r=db.prepare('INSERT INTO fees(school_id,student_id,amount,purpose,reference) VALUES(?,?,?,?,?)').run(sid,b.studentId,Math.round(amount),b.purpose.trim(),ref);return send(res,201,db.prepare(`SELECT f.*,s.first_name||' '||s.last_name student_name FROM fees f JOIN students s ON s.id=f.student_id WHERE f.id=?`).get(r.lastInsertRowid))}
  return send(res,404,{error:'API route not found.'});
}

function serveStatic(req,res,url){let pathname=decodeURIComponent(url.pathname);if(pathname==='/' )pathname='/index.html';if(pathname.endsWith('/'))pathname+='/index.html';const file=path.normalize(path.join(ROOT,pathname));if(!file.startsWith(ROOT+path.sep))return send(res,403,{error:'Forbidden'});fs.stat(file,(err,st)=>{if(err||!st.isFile())return send(res,404,{error:'Page not found.'});const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(file).pipe(res)})}

const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);const user=currentUser(req);if(url.pathname.startsWith('/api/'))return await api(req,res,url,user);return serveStatic(req,res,url)}catch(e){console.error(e);send(res,500,{error:'Internal server error.'})}});
server.listen(PORT,()=>console.log(`SchoolOS running at http://localhost:${PORT}`));
