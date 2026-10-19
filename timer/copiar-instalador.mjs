// Publica el instalador recien generado en public/downloads/, que es el que
// descarga la web desde Configuracion -> Widget.
//
// Son dos copias del MISMO archivo y hay que mantenerlas a mano si no:
//   - la que produce el bundle de Tauri vive en src-tauri/target/release/bundle/nsis/
//   - la web NO lee de ahi, lee de public/downloads/
// Si no se copia, la web sigue ofreciendo la version anterior y se instala una
// build vieja sin que nadie se de cuenta.
//
// La version se saca de tauri.conf.json para no escribirla dos veces.

import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Este script vive en timer/, asi que su propia carpeta ES la raiz de la app
// de escritorio. El repo esta un nivel mas arriba, que es donde vive public/.
const raiz = dirname(fileURLToPath(import.meta.url))
const nsis = join(raiz, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const destino = join(raiz, '..', 'public', 'downloads')

if (!existsSync(nsis)) {
  console.error('[instalador] No existe ' + nsis)
  console.error('[instalador] Ejecuta primero: npm run tauri build')
  process.exit(1)
}

// Tauri nombra el instalador con espacios y la version con guiones bajos:
//   "Paredes Cano Timer_1.0.0_x64-setup.exe"
const setup = readdirSync(nsis)
  .filter((f) => f.endsWith('-setup.exe'))
  .sort()
  .pop()

if (!setup) {
  console.error('[instalador] No hay ningun *-setup.exe en ' + nsis)
  process.exit(1)
}

const conf = JSON.parse(readFileSync(join(raiz, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const nombreWeb = `Paredes-Cano-Timer-${conf.version}-x64-setup.exe`

// Se deja UN solo instalador en public/downloads. Si quedara uno con otro nombre
// (una version anterior), la web tardaria o temprano volveria a ofrecerlo.
for (const viejo of readdirSync(destino)) {
  if (viejo !== nombreWeb && /setup.*\.exe$/i.test(viejo)) {
    rmSync(join(destino, viejo), { force: true })
    console.log('[instalador] Eliminado el obsoleto: ' + viejo)
  }
}

copyFileSync(join(nsis, setup), join(destino, nombreWeb))

const kb = Math.round(statSync(join(destino, nombreWeb)).size / 1024)
console.log('[instalador] Publicado: ' + nombreWeb + '  (' + kb + ' kB)')
console.log('[instalador] Origen: ' + setup)
console.log('[instalador] La web ya ofrece esta version en Configuracion -> Widget.')
