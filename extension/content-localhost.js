// Paredes Cano · espejo del estado de la actividad
// Se ejecuta únicamente dentro de la aplicación (http://localhost:3000).
// Lee el estado de la actividad desde localStorage y lo publica en chrome.storage
// para que la burbuja global (otras pestañas) pueda mostrarlo.
// También recibe comandos (pausar/reanudar/finalizar) desde otras pestañas
// y los reenvía a la aplicación mediante un evento de DOM.

(() => {
  if (window.__pcEspejoParedesCano) return
  window.__pcEspejoParedesCano = true
  window.__pcVersion = 'localhost-5'

  const storage = chrome.storage.local
  const CLAVES = ['pc_actividad_actual', 'pc_alertas_cada']
  const COMANDO_DOM = 'pc-comando'

  let ultimaFirma = ''
  let activo = true

  function contextoInactivo() {
    if (!activo) return true
    try {
      if (!chrome.runtime || !chrome.runtime.id) return true
    } catch {
      activo = false
      return true
    }
    return false
  }

  function leerClaves() {
    const datos = {}
    for (const clave of CLAVES) {
      try {
        datos[clave] = JSON.parse(window.localStorage.getItem(clave) || 'null')
      } catch {
        datos[clave] = null
      }
    }
    return datos
  }

  function espejar() {
    if (contextoInactivo()) return
    const datos = leerClaves()
    const firma = JSON.stringify(datos)
    if (firma === ultimaFirma) return
    ultimaFirma = firma
    storage.set({
      pc_estado: {
        actividad: datos.pc_actividad_actual,
        alertas: datos.pc_alertas_cada,
        conectado: true,
        marca: Date.now(),
      },
    })
  }

  // Publica cambios cada 1.5s
  setInterval(espejar, 1500)
  espejar()

  // Entrega un comando a la app (payload via atributo del DOM compartido)
  function despacharComando(datos) {
    document.documentElement.dataset.pcComando = JSON.stringify(datos)
    window.dispatchEvent(new CustomEvent(COMANDO_DOM))
  }

  // Escucha comandos enviados desde otras pestañas y los entrega a la app
  storage.onChanged.addListener((cambios, area) => {
    if (area !== 'local') return
    const cambio = cambios.pc_comando
    if (!cambio || !cambio.newValue || typeof cambio.newValue.accion !== 'string') return
    despacharComando(cambio.newValue)
  })

  // Además de onChanged, sondea pc_comando cada 700ms por fiabilidad
  function sondearComandos() {
    if (contextoInactivo()) return
    storage.get('pc_comando', (resultado) => {
      const comando = resultado.pc_comando
      if (!comando || typeof comando.accion !== 'string') return
      despacharComando(comando)
      storage.remove('pc_comando')
    })
  }
  setInterval(sondearComandos, 700)

  // Recoge cualquier comando pendiente (enviado mientras la app estaba cerrada)
  setTimeout(sondearComandos, 800)
})()
