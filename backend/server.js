require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(express.static(path.join(__dirname, "../frontend")));

const db=new Database("neurolearn.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS concepts(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 subject TEXT, name TEXT, explanation TEXT, difficulty INTEGER DEFAULT 1,
 mastery REAL DEFAULT 0, attempts INTEGER DEFAULT 0,
 correct_attempts INTEGER DEFAULT 0, incorrect_attempts INTEGER DEFAULT 0,
 last_review TEXT, next_review TEXT
);
CREATE TABLE IF NOT EXISTS sessions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task TEXT, created_at TEXT
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  grade TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  concept_id INTEGER,
  answer TEXT,
  correct INTEGER NOT NULL,
  hints INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id),
  FOREIGN KEY(concept_id) REFERENCES concepts(id)
);

CREATE TABLE IF NOT EXISTS student_progress(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  concept TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  correct_attempts INTEGER DEFAULT 0,
  incorrect_attempts INTEGER DEFAULT 0,
  hints INTEGER DEFAULT 0,
  mastery REAL DEFAULT 0,
  last_activity TEXT,
  UNIQUE(student_id, concept),
  FOREIGN KEY(student_id) REFERENCES students(id)
);
`);

const client=process.env.OPENAI_API_KEY?new OpenAI({apiKey:process.env.OPENAI_API_KEY}):null;

function fallbackChunks(task){
 return [
  {title:`Definir ${task}`,explanation:`Primero identifica qué significa ${task}.`,key:`la definición y idea central de ${task}`,question:`¿Cuál es la idea central de ${task}?`,difficulty:1},
  {title:`Ideas principales`,explanation:`Ahora identifica las ideas más importantes relacionadas con ${task}.`,key:`las ideas principales de ${task}`,question:`Menciona una idea principal de ${task}.`,difficulty:1},
  {title:`Relación o causa`,explanation:`Busca una relación, causa o mecanismo importante relacionado con ${task}.`,key:`una relación o causa importante de ${task}`,question:`¿Qué relación o causa importante puedes explicar sobre ${task}?`,difficulty:2},
  {title:`Ejemplo o consecuencia`,explanation:`Conecta el concepto con un ejemplo, aplicación o consecuencia.`,key:`un ejemplo o consecuencia de ${task}`,question:`Da un ejemplo o consecuencia de ${task}.`,difficulty:2},
  {title:`Conclusión`,explanation:`Resume lo aprendido en una sola idea.`,key:`un resumen breve de ${task}`,question:`Resume ${task} en una frase.`,difficulty:2}
 ];
}

async function generateChunks(task) {
  if (!client) return fallbackChunks(task);

  const prompt = `Crea una sesión educativa para esta tarea: "${task}".

Devuelve SOLO JSON válido con esta estructura:

{
  "chunks": [
    {
      {
  "title": "",
  "explanation": "",
  "key": "",
  "question": "",
  "difficulty": 1,
  "visual": ""- "visual" debe contener una descripción breve de la imagen o ilustración que ayudaría a comprender ese chunk.
- La descripción debe ser concreta y visual.
- Si el concepto se entiende mejor mediante un diagrama, proceso, objeto, mapa, persona, animal, fórmula o comparación visual, descríbelo.
- No incluyas texto escrito dentro de la imagen.
}
    }
  ]
}

Reglas pedagógicas:

- Crea entre 4 y 7 chunks.
- Cada chunk debe trabajar UN solo objetivo de aprendizaje.
- Divide el tema progresivamente usando CHUNKING.
- Cada explicación debe tener entre 2 y 4 oraciones.
- Las explicaciones deben ser específicas, informativas y claras.
- No uses explicaciones genéricas como "esto es importante" sin explicar por qué.
- Explica qué es el concepto, cómo funciona y por qué es importante cuando corresponda.
- Incluye un ejemplo concreto cuando ayude a comprender el concepto.
- Utiliza lenguaje claro para un estudiante de secundaria.
- No seas excesivamente infantil.
- No utilices palabras técnicas sin explicarlas brevemente.
- Evita repetir la misma información entre chunks.
- Cada chunk debe aportar información nueva.
- "key" debe contener una sola idea esencial que el estudiante pueda recordar.
- "question" debe evaluar ACTIVE RECALL.
- Las preguntas deben comprobar comprensión, no solamente memoria literal.
- No hagas preguntas cuya respuesta sea solamente "sí" o "no".
- Si el tema permite relaciones de causa y efecto, incluye alguna pregunta sobre ellas.
- Si el tema permite ejemplos o aplicaciones, incluye alguna pregunta sobre ellos.
- difficulty debe ser un número entre 1 y 5.
- Empieza con conceptos básicos y aumenta progresivamente la dificultad.
- NO resuelvas toda la tarea en un solo chunk.
- Prioriza comprensión, memoria y recuperación activa.
- Devuelve únicamente JSON válido.`;

  const r = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres el motor pedagógico de NEURO-LEARN. " +
          "Tu objetivo es enseñar mediante chunking, repetición y active recall. " +
          "Devuelve únicamente JSON válido."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return JSON.parse(r.choices[0].message.content).chunks;
}


app.post("/api/session",async(req,res)=>{
 try{
  const task=String(req.body.task||"").trim();
  if(!task)return res.status(400).json({error:"Falta la tarea."});
  const chunks=await generateChunks(task);
  const now=new Date().toISOString();
  const info=db.prepare("INSERT INTO sessions(task,created_at) VALUES(?,?)").run(task,now);
  for(const c of chunks){
   db.prepare(`INSERT INTO concepts(subject,name,explanation,difficulty,last_review,next_review)
   VALUES(?,?,?,?,?,?)`).run("General",c.title,c.explanation,c.difficulty,now,now);
  }
  res.json({sessionId:info.lastInsertRowid,task,chunks});
 }catch(e){console.error(e);res.status(500).json({error:e.message})}
});

app.post("/api/evaluate",async(req,res)=>{
 const answer=String(req.body.answer||"").trim();
 const expected=String(req.body.expected||"").trim();
 const concept=String(req.body.concept||"");
 if(!answer)return res.status(400).json({error:"Falta la respuesta."});

 let correct=false;
 if(client){
  try{
   const r=await client.chat.completions.create({
    model:process.env.OPENAI_MODEL||"gpt-4o-mini",
    response_format:{type:"json_object"},
    messages:[
     {role:"system",content:"Evalúas respuestas educativas. No seas excesivamente estricto. Considera equivalentes, sinónimos y respuestas parcialmente correctas. Devuelve JSON."},
     {role:"user",content:`Concepto: ${concept}\nIdea esperada: ${expected}\nRespuesta: ${answer}\nDevuelve {"correct":true/false,"feedback":"feedback breve en español"}.`}
    ]
   });
   const x=JSON.parse(r.choices[0].message.content);
   correct=!!x.correct;
   return res.json({correct,feedback:x.feedback});
  }catch(e){console.error(e)}
 }
 const a=answer.toLowerCase(),k=expected.toLowerCase().split(/\s+/).filter(x=>x.length>4);
 const hits=k.filter(x=>a.includes(x)).length;
 correct=k.length?hits>=Math.max(1,Math.ceil(k.length*.25)):a.length>5;
 res.json({correct,feedback:correct?"Correcto. Recuperaste una idea esencial.":"Estuviste cerca. Revisa la idea clave e inténtalo otra vez."});
});

app.get("/api/health",(req,res)=>res.json({ok:true,name:"NEURO-LEARN"}));
app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const grade = String(req.body.grade || "").trim();

    if (!name || !username || !password) {
      return res.status(400).json({
        error: "Completa nombre, usuario y contraseña."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 6 caracteres."
      });
    }

    const existing = db
      .prepare("SELECT id FROM students WHERE username = ?")
      .get(username);

    if (existing) {
      return res.status(409).json({
        error: "Ese usuario ya existe."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO students
      (name, username, password, grade, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      username,
      hashedPassword,
      grade,
      now
    );

    res.json({
      success: true,
      studentId: result.lastInsertRowid,
      name,
      username,
      grade
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "No se pudo crear la cuenta."
    });
  }
});
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Introduce usuario y contraseña."
      });
    }

    const student = db
      .prepare(`
        SELECT id, name, username, password, grade
        FROM students
        WHERE username = ?
      `)
      .get(username);

    if (!student) {
      return res.status(401).json({
        error: "Usuario o contraseña incorrectos."
      });
    }

    const valid = await bcrypt.compare(
      password,
      student.password
    );

    if (!valid) {
      return res.status(401).json({
        error: "Usuario o contraseña incorrectos."
      });
    }

    res.json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
        grade: student.grade
      }
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "No se pudo iniciar sesión."
    });
  }
});
app.post("/api/progress", (req, res) => {
  try {
    const studentId = Number(req.body.studentId);
    const concept = String(req.body.concept || "").trim();
    const correct = !!req.body.correct;
    const hints = Number(req.body.hints || 0);

    if (!studentId || !concept) {
      return res.status(400).json({
        error: "Faltan datos del progreso."
      });
    }

    const existing = db.prepare(`
      SELECT *
      FROM student_progress
      WHERE student_id = ? AND concept = ?
    `).get(studentId, concept);

    const now = new Date().toISOString();

    if (!existing) {

      const attempts = 1;
      const correctAttempts = correct ? 1 : 0;
      const incorrectAttempts = correct ? 0 : 1;

      const mastery = Math.round(
        (correctAttempts / attempts) * 100
      );

      db.prepare(`
        INSERT INTO student_progress
        (
          student_id,
          concept,
          attempts,
          correct_attempts,
          incorrect_attempts,
          hints,
          mastery,
          last_activity
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        studentId,
        concept,
        attempts,
        correctAttempts,
        incorrectAttempts,
        hints,
        mastery,
        now
      );

    } else {

      const attempts = existing.attempts + 1;

      const correctAttempts =
        existing.correct_attempts +
        (correct ? 1 : 0);

      const incorrectAttempts =
        existing.incorrect_attempts +
        (correct ? 0 : 1);

      const totalHints =
        existing.hints + hints;

      const mastery = Math.round(
        (correctAttempts / attempts) * 100
      );

      db.prepare(`
        UPDATE student_progress
        SET
          attempts = ?,
          correct_attempts = ?,
          incorrect_attempts = ?,
          hints = ?,
          mastery = ?,
          last_activity = ?
        WHERE student_id = ? AND concept = ?
      `).run(
        attempts,
        correctAttempts,
        incorrectAttempts,
        totalHints,
        mastery,
        now,
        studentId,
        concept
      );
    }

    res.json({
      success: true
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "No se pudo guardar el progreso."
    });
  }
});app.get("/api/progress/:studentId", (req, res) => {
  try {

    const studentId = Number(req.params.studentId);

    const student = db.prepare(`
      SELECT id, name, username, grade, created_at
      FROM students
      WHERE id = ?
    `).get(studentId);

    if (!student) {
      return res.status(404).json({
        error: "Estudiante no encontrado."
      });
    }

    const progress = db.prepare(`
      SELECT
        concept,
        attempts,
        correct_attempts,
        incorrect_attempts,
        hints,
        mastery,
        last_activity
      FROM student_progress
      WHERE student_id = ?
      ORDER BY mastery ASC
    `).all(studentId);

    const totals = db.prepare(`
      SELECT
        COUNT(*) AS concepts,
        COALESCE(SUM(attempts), 0) AS attempts,
        COALESCE(SUM(correct_attempts), 0) AS correct,
        COALESCE(SUM(incorrect_attempts), 0) AS incorrect
      FROM student_progress
      WHERE student_id = ?
    `).get(studentId);

    const overallMastery =
      totals.attempts > 0
        ? Math.round(
            (totals.correct / totals.attempts) * 100
          )
        : 0;

    let level = "Inicial";

    if (overallMastery >= 80) {
      level = "Consolidado";
    } else if (overallMastery >= 60) {
      level = "Dominado";
    } else if (overallMastery >= 40) {
      level = "En desarrollo";
    }

    res.json({
      student,
      level,
      mastery: overallMastery,
      totals,
      progress
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "No se pudo obtener el progreso."
    });
  }
});
  console.log("NEURO-LEARN backend running on port " + (process.env.PORT || 3000));
});
