const $=id=>document.getElementById(id);
let S={
  session:null,
  index:0,
  stage:"CHUNKING",
  errors:0,
  correct:0,
  hints:0,
  studentId:null,
  studentName:""
};

function speak(t) {
  if (!window.speechSynthesis) return;

  speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(t);

  u.lang = "es-ES";
  u.rate = 0.88;
  u.pitch = 1.12;
  u.volume = 1;

  const voices = speechSynthesis.getVoices();

  const voice =
    voices.find(v => v.lang === "es-ES") ||
    voices.find(v => v.lang.startsWith("es"));

  if (voice) {
    u.voice = voice;
  }

  speechSynthesis.speak(u);
}
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

$("start").onclick = async () => {
  const task = $("task").value.trim();

  if (!task) {
    $("status").textContent = "Escribe primero qué quieres aprender.";
    return;
  }

  $("status").textContent = "Analizando el tema y preparando tu sesión...";

  try {
    S.session = await api("/api/session", { task });

    S.index = 0;
    S.stage = "CHUNKING";
    S.errors = 0;
    S.correct = 0;
    S.hints = 0;

    $("session").classList.remove("hidden");

    render();
    teach();

    $("status").textContent = "";

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth"
    });

  } catch (e) {
    $("status").textContent =
      "No se pudo crear la sesión: " + e.message;
  }
};


function render() {
  const s = S.session;

  if (!s || !s.chunks) return;

  $("checklist").innerHTML = s.chunks
    .map((c, i) => `
      <div class="check ${i < S.index ? "done" : ""}">
        <span>${i < S.index ? "✓" : "○"}</span>
        ${esc(c.title)}
      </div>
    `)
    .join("");

  $("concepts").innerHTML = s.chunks
    .map(c => `
      <span class="concept">${esc(c.title)}</span>
    `)
    .join("");

  const pct =
    Math.round((S.index / s.chunks.length) * 100) || 0;

  $("percent").textContent = pct + "%";
  $("bar").style.width = pct + "%";

  $("progressLabel").textContent =
    `${Math.min(S.index, s.chunks.length)}/${s.chunks.length} chunks completados`;

  $("adaptation").innerHTML = `
    Tamaño de información:
    <b>${S.errors >= 2 ? "pequeño" : "normal"}</b><br>

    Nivel de ayuda:
    <b>${S.errors >= 2 ? "alta" : S.errors ? "media" : "normal"}</b><br>

    Errores:
    ${S.errors}<br>

    Aciertos:
    ${S.correct}<br>

    Pistas utilizadas:
    ${S.hints}
  `;
}


function current() {
  if (!S.session || !S.session.chunks) return null;

  return S.session.chunks[S.index];
}


function teach() {
  const c = current();

  if (!c) {
    finish();
    return;
  }

  S.stage = "CHUNKING";

  $("stage").textContent = "CHUNKING";

  $("chunkTitle").textContent = c.title;

  $("message").textContent =
    `Vamos a concentrarnos solamente en una parte del tema: ${c.title}. ` +
    `Primero entenderás la idea, después la escucharás nuevamente ` +
    `y finalmente comprobarás si puedes recordarla sin mirar.`;

  $("feedback").textContent = "";

  $("answer").value = "";

  $("recall").classList.add("hidden");

  $("next").classList.remove("hidden");

  $("next").textContent = "Comenzar este paso →";

  speak(
    `Vamos a concentrarnos solamente en una parte del tema: ${c.title}. ` +
    `Primero entenderás la idea, después la repetirás mentalmente ` +
    `y finalmente comprobarás si puedes recordarla sin mirar.`
  );
}


function next() {
  const c = current();

  if (!c) {
    finish();
    return;
  }


  // ETAPA 1: CHUNKING
  if (S.stage === "CHUNKING") {

    S.stage = "EXPLICACIÓN";

    $("stage").textContent = "EXPLICACIÓN";

    $("message").textContent =
      c.explanation ||
      `Ahora vamos a comprender con más detalle ${c.title}.`;

    $("next").textContent = "Escuchar idea clave →";

    speak(
      c.explanation ||
      `Ahora vamos a comprender con más detalle ${c.title}.`
    );

    return;
  }


  // ETAPA 2: EXPLICACIÓN
  if (S.stage === "EXPLICACIÓN") {

    S.stage = "REPETICIÓN";

    $("stage").textContent = "REPETICIÓN";

    $("message").textContent =
      `Idea clave: ${c.key}`;

    $("next").textContent = "Intentar recordar →";

    speak(
      `Quédate con esta idea principal. ${c.key}`
    );

    return;
  }


  // ETAPA 3: REPETICIÓN
  if (S.stage === "REPETICIÓN") {

    S.stage = "ACTIVE RECALL";

    $("stage").textContent = "ACTIVE RECALL";

    $("message").textContent =
      `Ahora intenta recuperar la información de tu memoria sin mirar la explicación. ` +
      `No necesitas utilizar exactamente las mismas palabras. Lo importante es demostrar que comprendiste la idea.`;

    $("question").textContent = c.question;

    $("recall").classList.remove("hidden");

    $("next").classList.add("hidden");

    $("answer").focus();

    speak(
      `Ahora intenta recordarlo sin mirar la explicación. ` +
      `${c.question}`
    );

    return;
  }
}


$("next").onclick = next;


$("repeat").onclick = () => {

  const c = current();

  if (!c) return;

  speak(
    `Escucha nuevamente la idea principal. ${c.key}`
  );
};


$("hint").onclick = async () => {

  const c = current();

  if (!c) return;

  S.hints++;

  let hintText;

  if (S.hints === 1) {

    hintText =
      `Pista: piensa en la idea principal de ${c.title}.`;

  } else if (S.hints === 2) {

    hintText =
      `Segunda pista: recuerda esta idea esencial. ${c.key}`;

  } else {

    hintText =
      `Última pista: intenta relacionar ${c.title} con la siguiente idea: ${c.key}`;
  }

  $("feedback").textContent = hintText;

  speak(hintText);

  render();
};


$("check").onclick = async () => {

  const answer = $("answer").value.trim();

  const c = current();

  if (!c || !answer) {

    $("feedback").textContent =
      "Escribe una respuesta antes de comprobarla.";

    return;
  }


  $("feedback").textContent =
    "Analizando tu respuesta...";

  try {

    const result = await api("/api/evaluate", {
      answer,
      expected: c.key,
      concept: c.title
      
    });


    // RESPUESTA CORRECTA
    if (result.correct) {

      S.correct++;
      await api("/api/progress", {
  studentId: S.studentId,
  concept: c.title,
  correct: true,
  hints: S.hints
});

      $("feedback").textContent =
        "✓ " + result.feedback;

      speak(
        `Correcto. ${result.feedback}`
      );

      S.index++;

      $("recall").classList.add("hidden");

      $("next").classList.remove("hidden");

      $("answer").value = "";

      render();


      if (S.index >= S.session.chunks.length) {

        finish();

      } else {

        setTimeout(() => {
          teach();
        }, 800);
      }

    }


    // RESPUESTA INCORRECTA
    else {

      S.errors++;
      await api("/api/progress", {
  studentId: S.studentId,
  concept: c.title,
  correct: false,
  hints: S.hints
});

      $("feedback").textContent =
        result.feedback ||
        "Todavía falta una parte importante. Revisa la idea clave e inténtalo nuevamente.";

      speak(
        result.feedback ||
        "Todavía falta una parte importante. Revisa la idea clave e inténtalo nuevamente."
      );

      render();

      $("answer").focus();
    }


  } catch (e) {

    $("feedback").textContent =
      "No se pudo evaluar la respuesta: " + e.message;
  }
};


function finish() {

  $("stage").textContent = "REVISIÓN";

  $("chunkTitle").textContent =
    "Sesión completada";

  $("message").textContent =
    `Has completado todos los chunks de esta sesión. ` +
    `Trabajaste el contenido paso a paso, escuchaste las ideas principales ` +
    `y después intentaste recuperarlas mediante active recall. ` +
    `Los conceptos que hayan generado más errores pueden necesitar una revisión posterior.`;

  $("next").classList.add("hidden");

  $("recall").classList.add("hidden");

  render();

  speak(
    `Has completado la sesión. ` +
    `Trabajaste cada concepto paso a paso y comprobaste cuánto podías recordar. ` +
    `Los conceptos que hayan sido más difíciles pueden revisarse nuevamente después.`
  );
}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
