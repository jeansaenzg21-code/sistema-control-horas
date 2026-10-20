# Publicacion del instalador de escritorio

Los binarios del instalador (`.exe`) ya no se versionan en el repositorio.
Para distribuirlo:

1. Compilar el widget con `npm run build:widget` (genera el instalador en
   `timer/src-tauri/target/release/bundle/`).
2. Publicar el `.exe` en la seccion "Releases" de GitHub (o en una ruta fuera
   del repositorio) y enlazarlo desde la aplicacion o la documentacion.
3. No guardar el binario dentro de `public/downloads/` ni commitearlo.

Los archivos `.exe` estan en `.gitignore` (`public/downloads/*.exe`).