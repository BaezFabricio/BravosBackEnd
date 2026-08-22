-- Vincula cada clase a un plan de membresía (opcional; NULL = cualquier plan puede reservar)
ALTER TABLE diaclase
  ADD COLUMN idPlan INT NULL AFTER idProfesor,
  ADD CONSTRAINT FK_diaclase_plan FOREIGN KEY (idPlan) REFERENCES plan(idPlan);
