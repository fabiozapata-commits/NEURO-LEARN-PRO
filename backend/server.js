require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const Database = require("better-sqlite3");

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

async function generateChunks(task){
 if(!client)return fallbackChunks(task);
 const prompt=`Crea una sesión educativa para esta tarea: "${task}".
Devuelve SOLO JSON válido:
{"chunks":[{"title":"","explanation":"","key":"","question":"","difficulty":1}]}
Reglas:
- 3 a 7 chunks.
- Cada chunk debe tener un solo objetivo.
- explicación breve y clara.
- key debe ser una idea esencial.
- question debe evaluar active recall.
- difficulty entre 1 y 5.
- No resuelvas toda la tarea de una vez.
- Prioriza comprensión.`;
 const r=await client.chat.completions.create({
  model:process.env.OPENAI_MODEL||"gpt-4o-mini",
  response_format:{type:"json_object"},
  messages:[
   {role:"system",content:"Eres el motor pedagógico de NEURO-LEARN. Devuelve únicamente JSON."},
   {role:"user",content:prompt}
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
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("NEURO-LEARN backend running on port " + (process.env.PORT || 3000));
});
