// Paredes Cano · burbuja global
// Se ejecuta en todas las páginas excepto la aplicación y la Chrome Web Store.
// Muestra una burbuja arrastrable con el estado de la actividad actual de la
// consultoría y permite pausar/reanudar/finalizar desde cualquier pestaña.

(() => {
  if (window.__pcBurbujaGlobal) return
  window.__pcBurbujaGlobal = true
  window.__pcVersion = 'global-5'

  const storage = chrome.storage.local
  const TAMANO = 46
  const MARGEN = 16
  const ANCHO_TARJETA = 300
  const CLAVE_POSICION = 'pc_widget_pos'

  const URL_LOGO = 'data:image/png;base64,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'

  const LOGO = `<img class="pc-logo-burbuja" src="${URL_LOGO}" alt="Paredes Cano" width="46" height="46" draggable="false"/>`

  const LOGO_MINI = `<img src="${URL_LOGO}" alt="" width="22" height="22" draggable="false"/>`

  const ETIQUETAS_ESTADO = {
    en_curso: 'En curso',
    pausada: 'Pausada',
    pendiente_aprobacion: 'Pendiente de aprobación',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
  }

  let estado = null
  let abierto = false
  let posicion = { x: 0, y: 0 }
  let activo = true

  // Detiene los callbacks de forma limpia si la extensión fue recargada y el
  // contexto quedó invalidado (evita errores "Extension context invalidated").
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

  // ---------- DOM ----------
  const burbuja = document.createElement('button')
  burbuja.id = 'pc-burbuja'
  burbuja.type = 'button'
  burbuja.title = 'Paredes Cano · Actividad'
  burbuja.innerHTML = LOGO

  const tarjeta = document.createElement('div')
  tarjeta.id = 'pc-tarjeta'
  tarjeta.style.display = 'none'
  tarjeta.innerHTML = `
    <div class="pc-tarjeta-cabecera">
      <span class="pc-logo-mini">${LOGO_MINI}</span>
      <span class="pc-titulo">Actividad en curso</span>
      <span class="pc-conexion" title=""></span>
      <button type="button" class="pc-cerrar" aria-label="Cerrar">&times;</button>
    </div>
    <div class="pc-tarjeta-cuerpo">
      <p class="pc-actividad-titulo"></p>
      <div class="pc-fila"><span>Tiempo transcurrido</span><b class="pc-tiempo"></b></div>
      <div class="pc-fila"><span>Estado</span><b class="pc-estado"></b></div>
      <div class="pc-acciones">
        <button type="button" class="pc-boton pc-boton-pausa"></button>
        <button type="button" class="pc-boton pc-boton-finalizar">Finalizar</button>
      </div>
      <p class="pc-aviso"></p>
      <p class="pc-feedback"></p>
    </div>
  `

  document.body.appendChild(burbuja)
  document.body.appendChild(tarjeta)

  // ---------- Posición ----------
  function posicionPorDefecto() {
    return {
      x: window.innerWidth - TAMANO - MARGEN,
      y: window.innerHeight - TAMANO - MARGEN,
    }
  }

  function encajar() {
    posicion.x = Math.min(Math.max(posicion.x, 0), Math.max(window.innerWidth - TAMANO, 0))
    posicion.y = Math.min(Math.max(posicion.y, 0), Math.max(window.innerHeight - TAMANO, 0))
  }

  function aplicarPosicionBurbuja() {
    burbuja.style.left = `${posicion.x}px`
    burbuja.style.top = `${posicion.y}px`
  }

  storage.get(CLAVE_POSICION, (resultado) => {
    const guardada = resultado[CLAVE_POSICION]
    posicion =
      guardada && Number.isFinite(guardada.x) && Number.isFinite(guardada.y)
        ? guardada
        : posicionPorDefecto()
    encajar()
    aplicarPosicionBurbuja()
  })

  window.addEventListener('resize', () => {
    encajar()
    aplicarPosicionBurbuja()
    if (abierto) posicionarTarjeta()
  })

  // ---------- Arrastre ----------
  let arrastre = null

  burbuja.addEventListener('pointerdown', (evento) => {
    arrastre = {
      x: evento.clientX - posicion.x,
      y: evento.clientY - posicion.y,
      movido: false,
    }
    burbuja.setPointerCapture(evento.pointerId)
    burbuja.classList.add('pc-arrastrando')
  })

  burbuja.addEventListener('pointermove', (evento) => {
    if (!arrastre) return
    const dx = evento.clientX - arrastre.x
    const dy = evento.clientY - arrastre.y
    if (Math.abs(evento.clientX - (arrastre.x + posicion.x)) > 4 ||
        Math.abs(evento.clientY - (arrastre.y + posicion.y)) > 4) {
      arrastre.movido = true
    }
    posicion = { x: dx, y: dy }
    encajar()
    aplicarPosicionBurbuja()
  })

  burbuja.addEventListener('pointerup', () => {
    if (!arrastre) return
    const movido = arrastre.movido
    arrastre = null
    burbuja.classList.remove('pc-arrastrando')
    storage.set({ [CLAVE_POSICION]: posicion })
    if (!movido) alternar()
  })

  // ---------- Estado ----------
  function leerEstado() {
    storage.get('pc_estado', (resultado) => {
      if (contextoInactivo()) return
      estado = resultado.pc_estado || null
      renderizar()
    })
  }

  function appConectada() {
    return (
      !!estado &&
      estado.conectado === true &&
      typeof estado.marca === 'number' &&
      Date.now() - estado.marca < 6000
    )
  }

  storage.onChanged.addListener((cambios, area) => {
    if (contextoInactivo() || area !== 'local') return
    if (cambios.pc_estado) {
      estado = cambios.pc_estado.newValue || null
      renderizar()
    }
  })

  // Reevalúa el estado y la conexión periódicamente: la app espeja cada 1.5s,
  // así la burbuja se actualiza sola sin necesidad de recargar la pestaña.
  function sondearEstado() {
    storage.get('pc_estado', (resultado) => {
      if (contextoInactivo()) return
      const nuevo = resultado.pc_estado || null
      if (JSON.stringify(nuevo) !== JSON.stringify(estado)) {
        estado = nuevo
        renderizar()
      }
    })
  }
  setInterval(sondearEstado, 1500)

  // ---------- Comandos ----------
  let mensajeTemporizador = null

  function mostrarFeedback(texto) {
    const fb = tarjeta.querySelector('.pc-feedback')
    if (!fb) return
    fb.textContent = texto
    fb.classList.add('pc-feedback-visible')
    clearTimeout(mensajeTemporizador)
    mensajeTemporizador = setTimeout(() => {
      fb.classList.remove('pc-feedback-visible')
    }, 2200)
  }

  function enviarComando(accion) {
    if (contextoInactivo()) return
    storage.set({ pc_comando: { accion, marca: Date.now() } })
    const mensajes = {
      pausar: 'Pausada',
      reanudar: 'Reanudada',
      finalizar: 'Finalizada',
    }
    if (appConectada()) {
      mostrarFeedback(`✓ Actividad ${mensajes[accion] || accion}`)
    } else {
      mostrarFeedback(`Enviado. Se aplicará al abrir Paredes Cano.`)
    }
  }

  // ---------- Render ----------
  function etiquetaEstado(clave) {
    return ETIQUETAS_ESTADO[clave] || clave || '—'
  }

  function formatearTiempo(ms) {
    const total = Math.max(0, Math.floor(ms / 1000))
    const horas = Math.floor(total / 3600)
    const minutos = Math.floor((total % 3600) / 60)
    const segundos = total % 60
    const dos = (n) => String(n).padStart(2, '0')
    if (horas > 0) return `${horas}:${dos(minutos)}:${dos(segundos)}`
    return `${dos(minutos)}:${dos(segundos)}`
  }

  function actualizarCronometro() {
    const el = tarjeta.querySelector('.pc-tiempo')
    if (!el) return
    const actividad = estado && estado.actividad ? estado.actividad : null
    if (!actividad || typeof actividad.iniciadaEn !== 'number') {
      el.textContent = '—'
      return
    }
    const enCurso = actividad.estado === 'en_curso'
    const ms = (actividad.acumuladoMs || 0) + (enCurso ? Date.now() - actividad.iniciadaEn : 0)
    el.textContent = formatearTiempo(ms)
  }

  // Tic del cronómetro: cada segundo mientras la tarjeta esté abierta
  setInterval(() => {
    if (!abierto) return
    actualizarCronometro()
  }, 1000)

  function renderizar() {
    const actividad = estado && estado.actividad ? estado.actividad : null
    const activa = actividad && ['en_curso', 'pausada'].includes(actividad.estado)
    const conectada = appConectada()

    // Indicador pulsante si hay actividad en curso
    if (activa && actividad.estado === 'en_curso') {
      burbuja.classList.add('pc-activa')
    } else {
      burbuja.classList.remove('pc-activa')
    }

    const serie = burbuja.querySelector('img')
    if (serie) {
      serie.style.opacity = conectada ? '1' : '0.35'
    }

    const cuerpo = tarjeta.querySelector('.pc-tarjeta-cuerpo')
    if (!cuerpo) return
    const titulo = tarjeta.querySelector('.pc-actividad-titulo')
    const tiempo = tarjeta.querySelector('.pc-tiempo')
    const estadoEl = tarjeta.querySelector('.pc-estado')
    const pausa = tarjeta.querySelector('.pc-boton-pausa')
    const finalizar = tarjeta.querySelector('.pc-boton-finalizar')
    const conexion = tarjeta.querySelector('.pc-conexion')
    const aviso = tarjeta.querySelector('.pc-aviso')

    // Indicador de conexión de la app
    if (conexion) {
      conexion.className = 'pc-conexion ' + (conectada ? 'pc-conexion-conectada' : 'pc-conexion-cerrada')
      conexion.title = conectada
        ? 'Paredes Cano conectada (localhost:3000 abierto)'
        : 'Paredes Cano cerrada: abre localhost:3000'
    }

    const abrirApp = () => window.open('http://localhost:3000/actividades', '_blank')

    if (!actividad) {
      if (titulo) titulo.textContent = 'No tienes una actividad activa.'
      if (tiempo) tiempo.textContent = '—'
      if (estadoEl) estadoEl.textContent = '—'
      if (pausa) {
        pausa.textContent = 'Abrir Paredes Cano'
        pausa.className = 'pc-boton pc-boton-abrir'
        pausa.onclick = abrirApp
      }
      if (finalizar) finalizar.style.display = 'none'
      if (aviso) aviso.textContent = conectada ? '' : 'La app está cerrada. Ábrela para sincronizar.'
      return
    }

    if (titulo) titulo.textContent = actividad.titulo || 'Actividad'
    actualizarCronometro()
    if (estadoEl) {
      estadoEl.textContent = etiquetaEstado(actividad.estado)
      estadoEl.className = 'pc-badge'
    }

    const pausada = actividad.estado === 'pausada'
    if (pausa) {
      pausa.textContent = pausada ? 'Reanudar' : 'Pausar'
      pausa.className = pausada
        ? 'pc-boton pc-boton-reanudar'
        : 'pc-boton pc-boton-pausa'
      pausa.onclick = () => enviarComando(pausada ? 'reanudar' : 'pausar')
    }
    if (finalizar) {
      finalizar.style.display = ''
      finalizar.onclick = () => enviarComando('finalizar')
    }
    if (aviso) aviso.textContent = conectada ? '' : 'La app está cerrada: se aplicará al abrirla.'
  }

  // ---------- Tarjeta ----------
  function posicionarTarjeta() {
    const espacioAbajo = window.innerHeight - (posicion.y + TAMANO) - MARGEN
    const abrirAbajo = espacioAbajo >= 280
    const izquierda = Math.max(
      Math.min(posicion.x + TAMANO - ANCHO_TARJETA / 2, window.innerWidth - ANCHO_TARJETA - MARGEN),
      MARGEN,
    )
    tarjeta.style.left = `${izquierda}px`
    tarjeta.style.top = abrirAbajo
      ? `${posicion.y + TAMANO + 8}px`
      : `${Math.max(posicion.y - 280 - 8, MARGEN)}px`
  }

  function alternar() {
    abierto = !abierto
    if (abierto) {
      renderizar()
      posicionarTarjeta()
      tarjeta.style.display = 'block'
    } else {
      tarjeta.style.display = 'none'
    }
  }

  tarjeta.querySelector('.pc-cerrar').addEventListener('click', alternar)

  leerEstado()
})()
