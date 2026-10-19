// Semilla de demostración para el dashboard del Administrador.
// Solo para el entorno local de desarrollo (paredescano).
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const envTxt = fs.readFileSync('.env.local', 'utf8')
function v(k) { const m = new RegExp(`^${k}=(.*)$`, 'm').exec(envTxt); return m ? m[1].trim() : '' }
const cfg = { host: v('DB_HOST'), port: Number(v('DB_PORT') || 3306), user: v('DB_USER'), password: v('DB_PASSWORD'), database: v('DB_NAME') }

if (cfg.host !== 'localhost' && cfg.host !== '127.0.0.1') {
  console.error(`Entorno no local (${cfg.host}). Abortado para no tocar datos reales.`)
  process.exit(1)
}

async function main() {
  const backupDir = 'C:\\Users\\tsoporte\\Respaldos\\ParedesCano'
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, 'demo-pre-dashboard-seed.sql')
  try { execSync(`mysqldump -h ${cfg.host} -u ${cfg.user} -p${cfg.password} ${cfg.database} > "${backupFile}"`, { shell: 'powershell.exe', stdio: 'ignore' }) } catch (e) { console.warn('No se pudo crear respaldo (continuando):', e.message) }

  const db = await mysql.createConnection(cfg)
  const [[emp]] = await db.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
  const empresaId = emp.id
  const [[admin]] = await db.query("SELECT id FROM usuarios WHERE rol='ADMINISTRACION' ORDER BY id LIMIT 1")
  const adminId = admin?.id

  const existingDemo = await db.query("SELECT COUNT(*) c FROM actividades WHERE descripcion LIKE 'DEMO-DASH %'")
  if (existingDemo[0][0].c > 0) {
    console.log(`Ya existen ${existingDemo[0][0].c} actividades DEMO-DASH. No se duplican.`)
  if (adminId) {
    await db.query(`UPDATE actividades SET revisado_por = ?, revisado_en = created_at WHERE descripcion LIKE 'DEMO-DASH %' AND estado = 'APROBADA' AND (id % 3 = 0) AND revisado_por IS NULL`, [adminId])
  }
  await db.end()
    return
  }

  const [areas] = await db.query('SELECT id, nombre FROM areas WHERE empresa_id = ? AND activo = 1 ORDER BY nombre', [empresaId])
  const [tipos] = await db.query('SELECT id, nombre FROM tipos_actividad ORDER BY id LIMIT 6')
  const tipoIds = tipos.map((t) => t.id)
  if (tipoIds.length === 0) { console.error('No hay tipos de actividad.'); process.exit(1) }

  const hash = await bcrypt.hash('Demo123!', 10)
  const estados = ['APROBADA', 'APROBADA', 'PENDIENTE_APROBACION', 'CORRECCION_SOLICITADA', 'RECHAZADA']
  const clientesPorArea = new Map()

  // Crear clientes ficticios en cada área (para cartera)
  for (const a of areas) {
    const ids = []
    for (let i = 1; i <= 3; i++) {
      const nombre = `Cliente Demo ${a.nombre.slice(0, 12)} ${i}`
      const [[ex]] = await db.query('SELECT id FROM clientes WHERE nombre = ? LIMIT 1', [nombre])
      let cid = ex?.id
      if (!cid) {
        const [r] = await db.query('INSERT INTO clientes (nombre, area_id, horas_contratadas, activo) VALUES (?,?,?,1)', [nombre, a.id, (i * 40 + 20)])
        cid = r.insertId
      }
      ids.push(cid)
    }
    clientesPorArea.set(a.id, ids)
  }

  let totalUsers = 0, totalActs = 0
  for (const area of areas) {
    // Crear 2 colaboradores demo por área
    const idsUsuarios = []
    for (let i = 1; i <= 2; i++) {
      const nombre = `DEMO ${area.nombre} ${String(i).padStart(2, '0')}`
      const [[ex]] = await db.query('SELECT id FROM usuarios WHERE nombre = ? LIMIT 1', [nombre])
      let uid = ex?.id
      if (!uid) {
        const [r] = await db.query(
          `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo, cargo)
           VALUES (?,?,?,?,?,?,1,?)`,
          [nombre, `demo${area.id}_${i}@paredescano.test`, `demo${area.id}_${i}`, hash, 'PERSONAL', area.id, 'Demo']
        )
        uid = r.insertId
      }
      idsUsuarios.push(uid)
      totalUsers++
    }

    // Crear actividades variadas
    const year = 2026, month = 10
    const dias = 14
    for (const uid of idsUsuarios) {
      // número variable de actividades
      const nActs = 8 + Math.floor(Math.random() * 8)
      for (let k = 0; k < nActs; k++) {
        const dia = 1 + Math.floor(Math.random() * dias)
        const hora = 8 + Math.floor(Math.random() * 8)
        const minuto = Math.random() > 0.5 ? 0 : 30
        const durMin = 30 + Math.floor(Math.random() * 150)
        const inicio = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`
        const finDate = new Date(inicio.replace(' ', 'T'))
        finDate.setMinutes(finDate.getMinutes() + durMin)
        const fin = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, '0')}-${String(finDate.getDate()).padStart(2, '0')} ${String(finDate.getHours()).padStart(2, '0')}:${String(finDate.getMinutes()).padStart(2, '0')}:00`
        const estado = estados[Math.floor(Math.random() * estados.length)]
        const clienteId = Math.random() > 0.3 ? clientesPorArea.get(area.id)[Math.floor(Math.random() * 3)] : null
        const facturable = Math.random() > 0.4 ? 1 : 0
        const tipoId = tipoIds[Math.floor(Math.random() * tipoIds.length)]
        const desc = `DEMO-DASH area=${area.id} user=${uid} k=${k}`
        await db.query(
          `INSERT INTO actividades (usuario_id, cliente_id, tipo_actividad_id, descripcion, facturable, inicio, fin, estado)
           VALUES (?,?,?,?,?,?,?,?)`,
          [uid, clienteId, tipoId, desc, facturable, inicio, fin, estado]
        )
        totalActs++
      }
    }
  }

  await db.end()
  console.log(`Seed DEMO finalizado: ${areas.length} áreas, ${totalUsers} usuarios, ${totalActs} actividades, ${(areas.length * 3)} clientes ficticios.`)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
