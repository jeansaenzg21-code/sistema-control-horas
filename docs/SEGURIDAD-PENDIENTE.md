# Seguridad pendiente (pasos manuales)

Estos pasos NO se pueden automatizar desde el codigo y los debe ejecutar el
responsable del repositorio de forma manual:

1. Hacer el repositorio privado en GitHub (o moverlo a una organizacion privada).
2. Rotar la clave de MySQL de produccion y de cualquier entorno que haya usado
   la clave antigua. Actualizar la variable `DB_PASSWORD` en todos los despliegues.
3. Limpiar el historial de git con `git filter-repo` o BFG para eliminar los
   secretos y archivos sensibles que pudieran haber quedado en commits anteriores.
4. Revocar cualquier token, credencial o clave de API que haya aparecido en el
   historial o en archivos versionados.
5. Verificar que no queden copias del instalador (.exe) ni respaldos (.sql)
   en el historial publico.

Nota: el codigo ya dejo de versionar `sql/respaldo-santa-rosa.sql`,
`tests/migracion-prueba.db` y `public/downloads/*.exe` (ver .gitignore).