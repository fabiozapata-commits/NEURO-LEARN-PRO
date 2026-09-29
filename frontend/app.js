const $=id=>document.getElementById(id);
let S={session:null,index:0,stage:"CHUNKING",errors:0,correct:0,hints:0};

function speak(t){if(!window.speechSynthesis)return;speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(t);u.lang="es-ES";u.rate=.88;speechSynthesis.speak(u)}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=SR?new SR():null;
if(rec){rec.lang="es-PE";rec.onresult=e=>{$("task").value=e.results[0][0].transcript;$("status").textContent="Voz capturada."};rec.onerror=e=>$("status").textContent="Error de voz: "+e.error}

$("listen").onclick=()=>rec&&rec.start();
$("speakIntro").onclick=()=>speak("Hola. Soy Neuro Learn. Dime qué necesitas aprender.");

 async function api(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const x = await r.json().catch(() => ({}));
    throw new Error(x.error || "Error del servidor");
  }

  return r.json();
}

$("start").onclick=async()=>{
 const task=$("task").value.trim();if(!task)return;
 $("status").textContent="Analizando y creando tu sesión...";
 try{
  S.session=await api("/api/session",{task});
  S.index=0;S.stage="CHUNKING";S.errors=0;S.correct=0;S.hints=0;
  $("session").classList.remove("hidden");render();teach();
  $("status").textContent="";
  window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
 }catch(e){$("status").textContent=e.message}
};

function render(){
 const s=S.session;
 $("checklist").innerHTML=s.chunks.map((c,i)=>`<div class="check ${i<S.index?"done":""}"><span>${i<S.index?"✓":"○"}</span>${esc(c.title)}</div>`).join("");
 $("concepts").innerHTML=s.chunks.map(c=>`<span class="concept">${esc(c.title)}</span>`).join("");
 const pct=Math.round(S.index/s.chunks.length*100)||0;
 $("percent").textContent=pct+"%";$("bar").style.width=pct+"%";
 $("progressLabel").textContent=`${Math.min(S.index,s.chunks.length)}/${s.chunks.length} chunks completados`;
 $("adaptation").innerHTML=`Tamaño: <b>${S.errors>=2?"pequeño":"normal"}</b><br>Ayuda: <b>${S.errors?"alta":"normal"}</b><br>Errores: ${S.errors}<br>Aciertos: ${S.correct}<br>Pistas: ${S.hints}`;
}

function current(){return S.session.chunks[S.index]}

function teach(){
 let c=current();if(!c)return finish();
 S.stage="CHUNKING";$("stage").textContent="CHUNKING";$("chunkTitle").textContent=c.title;
 $("message").textContent=`Vamos a trabajar solamente este paso: ${c.title}.`;
 $("recall").classList.add("hidden");$("next").textContent="Siguiente →";
 speak(`Vamos a trabajar solamente este paso. ${c.title}.`);
}

function next(){
 let c=current();if(!c)return finish();
 if(S.stage==="CHUNKING"){
   S.stage="EXPLICACIÓN";$("stage").textContent="EXPLICACIÓN AUDITIVA";$("message").textContent=c.explanation;speak(c.explanation);return;
 }
 if(S.stage==="EXPLICACIÓN"){
   S.stage="REPETICIÓN";$("stage").textContent="REPETICIÓN AUDITIVA";$("message").textContent="Idea clave: "+c.key;speak("Recuerda: "+c.key);return;
 }
 if(S.stage==="REPETICIÓN"){
   S.stage="ACTIVE RECALL";$("stage").textContent="ACTIVE RECALL";$("message").textContent="Ahora intenta recordarlo sin mirar la explicación.";
   $("question").textContent=c.question;$("recall").classList.remove("hidden");$("next").classList.add("hidden");speak(c.question);return;
 }
}

$("next").onclick=next;
$("repeat").onclick=()=>{let c=current();if(c)speak(c.key)};
$("hint").onclick=async()=>{
 S.hints++;let c=current();$("feedback").textContent="Pista: "+c.key;speak("Pista. "+c.key);render();
};
$("check").onclick=async()=>{
 let answer=$("answer").value.trim(),c=current();if(!answer)return;
 try{
  let result=await api("/api/evaluate",{answer,expected:c.key,concept:c.title});
  if(result.correct){
   S.correct++;$("feedback").textContent="✓ "+result.feedback;speak(result.feedback);
   S.index++;$("recall").classList.add("hidden");$("next").classList.remove("hidden");render();
   if(S.index>=S.session.chunks.length)finish();else teach();
  }else{
   S.errors++;$("feedback").textContent=result.feedback;speak(result.feedback);render();
  }
 }catch(e){$("feedback").textContent=e.message}
};

function finish(){
 $("stage").textContent="REVISIÓN";$("chunkTitle").textContent="Sesión completada";
 $("message").textContent="Has completado todos los chunks. Los conceptos difíciles pueden programarse para revisión posterior.";
 $("next").classList.add("hidden");$("recall").classList.add("hidden");render();speak("Has completado la sesión. Los conceptos difíciles quedarán preparados para revisión.");
}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
