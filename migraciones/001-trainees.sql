-- Ejecutar una vez en la base del sistema de horas, antes de desplegar el código.
ALTER TABLE usuarios
  ADD COLUMN trainee_inicio DATE NULL,
  ADD COLUMN trainee_vence DATE NULL;
