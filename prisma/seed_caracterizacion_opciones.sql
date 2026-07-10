-- ═══════════════════════════════════════════════════════════════════════════
--  SEED: opciones cerradas del módulo Caracterización (CaracterizacionOpcion)
--  Idempotente: ON CONFLICT (modulo, campo, valor) DO NOTHING. Correr en Supabase
--  DESPUÉS de prisma/caracterizacion_migration.sql. Re-ejecutable sin duplicar.
--
--  Convención: valores en MAYÚSCULAS (como el resto de la app). Se referencian por
--  ID desde la ficha; el nombre se interpola al mostrar/exportar.
--  Incluye listas de Fase 1 y Fase 2 (la tabla se crea una vez; la UI revela por fase).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── FAMILIA (Módulo 3) ─────────────────────────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'FAMILIA','parentesco','CÓNYUGE',1),
 (gen_random_uuid(),'FAMILIA','parentesco','HIJO/A',2),
 (gen_random_uuid(),'FAMILIA','parentesco','PADRE/MADRE',3),
 (gen_random_uuid(),'FAMILIA','parentesco','HERMANO/A',4),
 (gen_random_uuid(),'FAMILIA','parentesco','NIETO/A',5),
 (gen_random_uuid(),'FAMILIA','parentesco','SOBRINO/A',6),
 (gen_random_uuid(),'FAMILIA','parentesco','OTRO',7),
 (gen_random_uuid(),'FAMILIA','vulnerabilidad','NINGUNA',1),
 (gen_random_uuid(),'FAMILIA','vulnerabilidad','EMBARAZO',2),
 (gen_random_uuid(),'FAMILIA','vulnerabilidad','DISCAPACIDAD',3),
 (gen_random_uuid(),'FAMILIA','vulnerabilidad','ENFERMEDAD CRÓNICA',4),
 (gen_random_uuid(),'FAMILIA','vulnerabilidad','CONDICIÓN PSIQUIÁTRICA',5),
 (gen_random_uuid(),'IDENTIDAD','estadoCivil','SOLTERO/A',1),
 (gen_random_uuid(),'IDENTIDAD','estadoCivil','CASADO/A',2),
 (gen_random_uuid(),'IDENTIDAD','estadoCivil','CONCUBINATO',3),
 (gen_random_uuid(),'IDENTIDAD','estadoCivil','DIVORCIADO/A',4),
 (gen_random_uuid(),'IDENTIDAD','estadoCivil','VIUDO/A',5)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- ── TRIAJE (Módulo 5) ──────────────────────────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','A+',1),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','A-',2),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','B+',3),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','B-',4),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','AB+',5),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','AB-',6),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','O+',7),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','O-',8),
 (gen_random_uuid(),'TRIAJE','grupoSanguineo','DESCONOCIDO',9),
 (gen_random_uuid(),'TRIAJE','alergia','SIN ALERGIAS',1),
 (gen_random_uuid(),'TRIAJE','alergia','PENICILINA',2),
 (gen_random_uuid(),'TRIAJE','alergia','AINES (IBUPROFENO/DICLOFENACO)',3),
 (gen_random_uuid(),'TRIAJE','alergia','SULFAS',4),
 (gen_random_uuid(),'TRIAJE','alergia','MARISCOS/ALIMENTOS',5),
 (gen_random_uuid(),'TRIAJE','alergia','POLVO/ÁCAROS',6),
 (gen_random_uuid(),'TRIAJE','alergia','OTRAS',7),
 (gen_random_uuid(),'TRIAJE','discapacidadTipo','VISUAL',1),
 (gen_random_uuid(),'TRIAJE','discapacidadTipo','AUDITIVA',2),
 (gen_random_uuid(),'TRIAJE','discapacidadTipo','MOTORA',3),
 (gen_random_uuid(),'TRIAJE','discapacidadTipo','COGNITIVA',4),
 (gen_random_uuid(),'TRIAJE','discapacidadTipo','MÚLTIPLE',5),
 (gen_random_uuid(),'TRIAJE','discapacidadTipo','OTRA',6),
 (gen_random_uuid(),'TRIAJE','vacunaAntitetanica','AL DÍA',1),
 (gen_random_uuid(),'TRIAJE','vacunaAntitetanica','REQUIERE REFUERZO INMEDIATO',2),
 (gen_random_uuid(),'TRIAJE','vacunaAntitetanica','NO SABE',3)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- ── NECESIDADES / ANTROPOMETRÍA (Módulo 4) ─────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','BEBÉ (0-24M)',1),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','NIÑOS (2-16)',2),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','XS',3),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','S',4),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','M',5),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','L',6),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','XL',7),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','XXL',8),
 (gen_random_uuid(),'NECESIDADES','tallaCamisa','XXXL',9),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','NIÑOS (2-16)',1),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','26',2),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','28',3),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','30',4),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','32',5),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','34',6),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','36',7),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','38',8),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','40',9),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','42',10),
 (gen_random_uuid(),'NECESIDADES','tallaPantalon','44+',11),
 (gen_random_uuid(),'NECESIDADES','necesidad','FÓRMULA LÁCTEA (0-6M)',1),
 (gen_random_uuid(),'NECESIDADES','necesidad','FÓRMULA LÁCTEA (6-12M)',2),
 (gen_random_uuid(),'NECESIDADES','necesidad','PAÑALES ETAPA 1-3',3),
 (gen_random_uuid(),'NECESIDADES','necesidad','PAÑALES ETAPA 4-6',4),
 (gen_random_uuid(),'NECESIDADES','necesidad','PAÑALES DE ADULTO',5),
 (gen_random_uuid(),'NECESIDADES','necesidad','TOALLAS SANITARIAS',6),
 (gen_random_uuid(),'NECESIDADES','necesidad','ROPA INTERIOR',7),
 (gen_random_uuid(),'NECESIDADES','necesidad','NINGUNA',8)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- Talla de calzado: 15 a 45 (+ "45+"). generate_series para no listar 31 filas a mano.
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden")
SELECT gen_random_uuid(), 'NECESIDADES', 'tallaCalzado', g::text, g - 14
FROM generate_series(15, 45) g
ON CONFLICT ("modulo","campo","valor") DO NOTHING;
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'NECESIDADES','tallaCalzado','45+',32)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- ── VIVIENDA (Módulo 6) ────────────────────────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'VIVIENDA','tenencia','PROPIA PAGADA',1),
 (gen_random_uuid(),'VIVIENDA','tenencia','PROPIA PAGÁNDOSE',2),
 (gen_random_uuid(),'VIVIENDA','tenencia','ALQUILADA',3),
 (gen_random_uuid(),'VIVIENDA','tenencia','PRESTADA',4),
 (gen_random_uuid(),'VIVIENDA','tenencia','INVADIDA / OCUPACIÓN DE HECHO',5),
 (gen_random_uuid(),'VIVIENDA','tenencia','CUIDADOR',6),
 (gen_random_uuid(),'VIVIENDA','tipoVivienda','CASA',1),
 (gen_random_uuid(),'VIVIENDA','tipoVivienda','APARTAMENTO',2),
 (gen_random_uuid(),'VIVIENDA','tipoVivienda','QUINTA',3),
 (gen_random_uuid(),'VIVIENDA','tipoVivienda','ANEXO',4),
 (gen_random_uuid(),'VIVIENDA','tipoVivienda','HABITACIÓN',5),
 (gen_random_uuid(),'VIVIENDA','tipoVivienda','RANCHO / VIVIENDA IMPROVISADA',6),
 (gen_random_uuid(),'VIVIENDA','material','BLOQUE / LADRILLO',1),
 (gen_random_uuid(),'VIVIENDA','material','BAHAREQUE',2),
 (gen_random_uuid(),'VIVIENDA','material','MADERA',3),
 (gen_random_uuid(),'VIVIENDA','material','ZINC',4),
 (gen_random_uuid(),'VIVIENDA','material','MIXTO',5),
 (gen_random_uuid(),'VIVIENDA','nivelDano','SIN DAÑOS',1),
 (gen_random_uuid(),'VIVIENDA','nivelDano','DAÑOS MENORES (GRIETAS SUPERFICIALES)',2),
 (gen_random_uuid(),'VIVIENDA','nivelDano','DAÑOS MODERADOS (GRIETAS ESTRUCTURALES)',3),
 (gen_random_uuid(),'VIVIENDA','nivelDano','DAÑOS SEVEROS (INHABITABLE)',4),
 (gen_random_uuid(),'VIVIENDA','nivelDano','PÉRDIDA TOTAL (COLAPSO)',5),
 (gen_random_uuid(),'VIVIENDA','estadoEnseres','INTACTOS',1),
 (gen_random_uuid(),'VIVIENDA','estadoEnseres','PARCIALMENTE RECUPERADOS',2),
 (gen_random_uuid(),'VIVIENDA','estadoEnseres','PÉRDIDA TOTAL',3)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- ── ENTORNO (Módulo 6) ─────────────────────────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'ENTORNO','servicioAfectado','AGUA POTABLE',1),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','ELECTRICIDAD',2),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','GAS DOMÉSTICO',3),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','TELEFONÍA',4),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','INTERNET',5),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','ASEO URBANO',6),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','AGUAS SERVIDAS / CLOACAS',7),
 (gen_random_uuid(),'ENTORNO','servicioAfectado','NINGUNO',8),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','ZONA DE DESLIZAMIENTO ACTIVO',1),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','ZONA INUNDABLE',2),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','CERCA DE RÍO/QUEBRADA',3),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','EDIFICACIÓN VECINA EN RIESGO DE COLAPSO',4),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','TENDIDO ELÉCTRICO CAÍDO',5),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','FUGA DE GAS',6),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','TERRENO INESTABLE',7),
 (gen_random_uuid(),'ENTORNO','riesgoEntorno','NINGUNO',8)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- ── SOCIOECONÓMICO (Módulo 7 · Fase 2) ─────────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','SIN INSTRUCCIÓN',1),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','PRIMARIA INCOMPLETA',2),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','PRIMARIA COMPLETA',3),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','SECUNDARIA INCOMPLETA',4),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','SECUNDARIA COMPLETA',5),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','TÉCNICO MEDIO',6),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','UNIVERSITARIO/TSU',7),
 (gen_random_uuid(),'SOCIOECONOMICO','nivelEducativo','POSTGRADO',8),
 (gen_random_uuid(),'SOCIOECONOMICO','rangoIngreso','MENOS DE $50',1),
 (gen_random_uuid(),'SOCIOECONOMICO','rangoIngreso','$51 - $100',2),
 (gen_random_uuid(),'SOCIOECONOMICO','rangoIngreso','$101 - $200',3),
 (gen_random_uuid(),'SOCIOECONOMICO','rangoIngreso','$201 - $400',4),
 (gen_random_uuid(),'SOCIOECONOMICO','rangoIngreso','MÁS DE $400',5),
 (gen_random_uuid(),'SOCIOECONOMICO','accesoPatria','SÍ',1),
 (gen_random_uuid(),'SOCIOECONOMICO','accesoPatria','NO',2),
 (gen_random_uuid(),'SOCIOECONOMICO','accesoPatria','BLOQUEADO / PERDIÓ ACCESO',3),
 (gen_random_uuid(),'SOCIOECONOMICO','bonoContingencia','SÍ',1),
 (gen_random_uuid(),'SOCIOECONOMICO','bonoContingencia','NO',2),
 (gen_random_uuid(),'SOCIOECONOMICO','bonoContingencia','NO SABE',3)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;

-- ── LABORAL (Módulo 8 · Fase 2) ────────────────────────────────────────────
INSERT INTO "CaracterizacionOpcion" ("id","modulo","campo","valor","orden") VALUES
 (gen_random_uuid(),'LABORAL','impactoLaboral','MANTUVO SU EMPLEO/INGRESO',1),
 (gen_random_uuid(),'LABORAL','impactoLaboral','PERDIÓ SU EMPLEO',2),
 (gen_random_uuid(),'LABORAL','impactoLaboral','PERDIÓ SU LOCAL/NEGOCIO PROPIO',3),
 (gen_random_uuid(),'LABORAL','impactoLaboral','PERDIÓ SUS HERRAMIENTAS DE TRABAJO',4),
 (gen_random_uuid(),'LABORAL','sectorEconomico','TURISMO Y SERVICIOS',1),
 (gen_random_uuid(),'LABORAL','sectorEconomico','COMERCIO',2),
 (gen_random_uuid(),'LABORAL','sectorEconomico','PESCA Y AGRICULTURA',3),
 (gen_random_uuid(),'LABORAL','sectorEconomico','CONSTRUCCIÓN Y MANTENIMIENTO',4),
 (gen_random_uuid(),'LABORAL','sectorEconomico','EDUCACIÓN Y ADMINISTRACIÓN',5),
 (gen_random_uuid(),'LABORAL','sectorEconomico','SALUD',6),
 (gen_random_uuid(),'LABORAL','sectorEconomico','TRANSPORTE',7),
 (gen_random_uuid(),'LABORAL','sectorEconomico','ECONOMÍA INFORMAL / CUENTA PROPIA',8),
 (gen_random_uuid(),'LABORAL','sectorEconomico','OTRO',9),
 (gen_random_uuid(),'LABORAL','oficio','ALBAÑIL',1),
 (gen_random_uuid(),'LABORAL','oficio','PLOMERO',2),
 (gen_random_uuid(),'LABORAL','oficio','ELECTRICISTA',3),
 (gen_random_uuid(),'LABORAL','oficio','CARPINTERO',4),
 (gen_random_uuid(),'LABORAL','oficio','SOLDADOR',5),
 (gen_random_uuid(),'LABORAL','oficio','CONDUCTOR PESADO',6),
 (gen_random_uuid(),'LABORAL','oficio','OPERADOR DE MAQUINARIA',7),
 (gen_random_uuid(),'LABORAL','oficio','DOCENTE',8),
 (gen_random_uuid(),'LABORAL','oficio','PESCADOR',9),
 (gen_random_uuid(),'LABORAL','oficio','TOLDERÍA',10),
 (gen_random_uuid(),'LABORAL','oficio','MÉDICO/ENFERMERO',11),
 (gen_random_uuid(),'LABORAL','oficio','ADMINISTRATIVO',12),
 (gen_random_uuid(),'LABORAL','oficio','OTRO',13),
 (gen_random_uuid(),'LABORAL','aptitudFisica','ÓPTIMO (APTO CUADRILLAS FÍSICAS)',1),
 (gen_random_uuid(),'LABORAL','aptitudFisica','CON LIMITACIONES MODERADAS (LOGÍSTICA)',2),
 (gen_random_uuid(),'LABORAL','aptitudFisica','RESTRINGIDO (ÁREAS PASIVAS/CENSOS)',3),
 (gen_random_uuid(),'LABORAL','disponibilidad','MEDIO TURNO',1),
 (gen_random_uuid(),'LABORAL','disponibilidad','MAÑANA',2),
 (gen_random_uuid(),'LABORAL','disponibilidad','TARDE',3),
 (gen_random_uuid(),'LABORAL','disponibilidad','NOCHE',4),
 (gen_random_uuid(),'LABORAL','disponibilidad','TURNO COMPLETO',5)
ON CONFLICT ("modulo","campo","valor") DO NOTHING;
