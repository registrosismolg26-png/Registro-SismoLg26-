import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let patologias = await prisma.patologia.findMany({
      orderBy: { nombre: "asc" },
    });

    // Auto-seed si está vacío
    if (patologias.length === 0) {
      const defaultNombres = [
        "Abdomen Agudo",
        "Abortos Espontáneos",
        "Acné",
        "ACV Isquémico",
        "Adenomegalia",
        "Alopecia",
        "Alergia Respiratoria",
        "Amigdalitis",
        "Amenorrea",
        "Amenorrea Primaria",
        "Amenorrea Secundaria",
        "Anaovulación",
        "Anemia",
        "Aneurisma",
        "Angina",
        "Angor",
        "Anorexia",
        "Apendicitis",
        "Arritmia",
        "Arritmias",
        "Artralgia",
        "Artritis Reumatoidea",
        "Artrosis",
        "Asma",
        "Astenia",
        "Bajo Peso",
        "Bocio",
        "Bronquitis Obstructiva",
        "Cefalea",
        "Cirrosis",
        "Climaterio",
        "Colelitiasis",
        "Cólico Renal",
        "Conjuntivitis",
        "Constipación",
        "Control By Pass",
        "Control de Ca.",
        "Dermatitis",
        "Desnutrición",
        "Diabetes Mellitus",
        "Diarrea",
        "Dislipemia",
        "Disnea",
        "Dispepsia",
        "Disuria",
        "Dolor Abdominal",
        "Eclampsia",
        "Edemas",
        "Embarazo - Control 1er. Trimestre",
        "Embarazo - Control 2do. Trimestre",
        "Embarazo - Control 3er. Trimestre",
        "Enfermedad de Hodgkin",
        "Enfermedad de Transmisión Sexual",
        "Epistaxis",
        "Epilepsia",
        "EPOC - Insuficiencia Respiratoria",
        "Escabiosis",
        "Etilismo",
        "Faringitis",
        "Fibrosis Quística",
        "Fiebre",
        "Fiebre Reumática",
        "Gastroenteritis",
        "Gota",
        "Hematomas",
        "Hematuria",
        "Hepatitis",
        "Hepatomegalia",
        "Hepatopatía",
        "Herpes",
        "Hipercolesterolemia / Colesterolemia",
        "Hipertensión Arterial",
        "Hipertiroidismo",
        "Hipogonadismo Masculino",
        "Hipotiroidismo",
        "Hirsutismo",
        "Ictericia",
        "Infección Urinaria",
        "Infertilidad Femenina",
        "Infertilidad Masculina",
        "Insuficiencia Cardíaca",
        "Insuficiencia Renal Crónica/Aguda",
        "Intoxicación",
        "Leucemia",
        "Linfoma",
        "Linfoma No-Hodgkin",
        "Lipotimia",
        "Litiasis Vesicular",
        "Lumbalgia",
        "Lupus Eritematoso",
        "Mareos",
        "Melanoma",
        "Menopausia",
        "Metrorragia",
        "Metabolopatía",
        "Mialgia",
        "Mieloma",
        "Mononucleosis y la Infecciosa",
        "Megacolon",
        "Neumopatía",
        "Obesidad",
        "Osteopenia",
        "Osteoporosis",
        "Parotiditis",
        "Pielonefritis",
        "Poliartralgias",
        "Polidipsia",
        "Precordialgia - Dolor Precordial",
        "Prequirúrgico",
        "Prostatismo",
        "Prurito",
        "Psoriasis",
        "Raynaud, Enfermedad - Síndrome",
        "Reacción Alérgica",
        "Rinitis",
        "Rinofaringitis Aguda",
        "Sarcoma",
        "Síndrome de la Silla Turca",
        "Síndrome de Ovario Poliquístico (SOPQ)",
        "Síndrome Febril Prolongado",
        "Síndrome Vertiginoso",
        "Sinusitis",
        "Sobrepeso",
        "Sudoración",
        "Tos Crónica",
        "Úlcera Gástrica / Duodenal",
        "Urticaria",
        "Vómitos",
        "Otros"
      ];
      await prisma.patologia.createMany({
        data: defaultNombres.map(nombre => ({ nombre })),
        skipDuplicates: true
      });

      patologias = await prisma.patologia.findMany({
        orderBy: { nombre: "asc" },
      });
    }

    return NextResponse.json({ success: true, patologias: patologias.map(p => p.nombre) });
  } catch (error: any) {
    console.error("Error en GET /api/patologias:", error);
    return NextResponse.json({ error: "Error al listar patologías" }, { status: 500 });
  }
}
