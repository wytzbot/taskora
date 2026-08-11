const KEY="taskora_state_v1";
const DEFAULT={
  version:1,
  user:{name:"",school:"",program:"",level:""},
  courses:[],
  tasks:[],
  exams:[],
  sessions:[],
  goals:[],
  settings:{theme:"system",notifications:true,deadlineNotifications:true,studyNotifications:true,examNotifications:true,streakNotifications:true},
  subscription:{premium:false,providerStatus:"unknown",expiresAt:null},
  ai:{used:0,day:"",history:[]},
  referral:{code:"",count:0},
  onboarding:false
};

const uid=()=>crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(36).slice(2);
const todayKey=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmtDate=d=>d?new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(d+"T12:00:00")):"No date";
const daysUntil=d=>d?Math.ceil((new Date(d+"T23:59:59")-new Date())/86400000):9999;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function load(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||"null");
    return merge(DEFAULT,x||{});
  }catch{return structuredClone(DEFAULT)}
}
function merge(base,extra){
  const out=structuredClone(base);
  if(!extra) return out;
  for(const k of Object.keys(out)) if(extra[k]!==undefined) out[k]=Array.isArray(out[k])?extra[k]:typeof out[k]==="object"&&out[k]!==null?{...out[k],...extra[k]}:extra[k];
  return out;
}

export class TaskoraApp{
  constructor(){this.state=load();this.view="home";this.installEvent=null;this.busy=false;this.paymentConfig=null}
  start(){
    this.applyTheme();
    this.bindGlobal();
    this.loadPaymentConfig();
    if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
    window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();this.installEvent=e;});
    if(!this.state.onboarding) this.renderOnboarding(); else this.render();
  }
  async loadPaymentConfig(){
    try{const r=await fetch("/payment-config.json");if(r.ok)this.paymentConfig=await r.json()}catch{/* payment config optional */}
  }
  save(){localStorage.setItem(KEY,JSON.stringify(this.state));}
  toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(this.tt);this.tt=setTimeout(()=>t.classList.remove("show"),2600)}
  applyTheme(){
    const mode=this.state.settings.theme;
    document.documentElement.dataset.theme=mode;
    if(mode==="dark") this.dark(true); else if(mode==="light") this.dark(false); else this.dark(matchMedia("(prefers-color-scheme: dark)").matches);
  }
  dark(on){
    if(on){document.documentElement.style.setProperty("--bg","#0d1a20");document.documentElement.style.setProperty("--surface","#14252d");document.documentElement.style.setProperty("--surface2","#1c343e");document.documentElement.style.setProperty("--text","#eff9fc");document.documentElement.style.setProperty("--muted","#9bb0b8");document.documentElement.style.setProperty("--line","#29434d");}
    else{for(const [k,v] of Object.entries({"--bg":"#f4f8fa","--surface":"#fff","--surface2":"#e8f3f7","--text":"#10252e","--muted":"#63777f","--line":"#dbe7eb"}))document.documentElement.style.setProperty(k,v)}
  }
  bindGlobal(){
    document.addEventListener("click",e=>{
      const b=e.target.closest("[data-action]"); if(!b)return;
      const a=b.dataset.action;
      if(a==="nav")this.go(b.dataset.view);
      if(a==="add")this.addSheet();
      if(a==="close")this.closeOverlay();
      if(a==="install")this.install();
      if(a==="premium")this.premiumSheet();
      if(a==="theme")this.changeTheme();
      if(a==="notifications")this.toggleNotifications();
      if(a==="clear")this.clearData();
      if(a==="ask")this.askCard(b.dataset.question,b.dataset.context||"");
      if(a==="openTask")this.taskSheet(b.dataset.id);
      if(a==="complete")this.completeTask(b.dataset.id);
      if(a==="deleteTask")this.deleteTask(b.dataset.id);
      if(a==="saveCourse")this.saveCourse();
      if(a==="saveTask")this.saveTask();
      if(a==="saveExam")this.saveExam();
      if(a==="saveProfile")this.saveProfile();
      if(a==="saveGoal")this.saveGoal();
      if(a==="savePlan")this.savePlan();
      if(a==="profile")this.profileSheet();
      if(a==="help")this.infoSheet("Help & Support","If something is not working, check your connection, refresh the PWA, and try again. Saved planner data is local-first.");
      if(a==="privacy")this.infoSheet("Privacy","Taskora stores planner data locally on your device. AI requests send only the relevant context needed to answer the selected question. Payment entitlement should be verified server-side.");
      if(a==="terms")this.infoSheet("Terms","Use Taskora responsibly. AI suggestions are planning assistance, not guaranteed academic outcomes.");
      if(a==="about")this.infoSheet("About","Taskora is an academic workload autopilot focused on helping students decide what to do next.");
      if(a==="usage")this.infoSheet("AI usage",`${this.aiUsed()} AI action(s) used today. Free: 3/day. Premium: 30/day after server-side entitlement verification.`);
      if(a==="dismissInstall"){localStorage.setItem("taskora_install_dismissed","1");this.closeOverlay();}
      if(a==="focus")this.focus(b.dataset.id);
      if(a==="rescue")this.rescue();
      if(a==="askOther")this.askOther();
      if(a==="share")this.share();
      if(a==="referral")this.referral();
    });
  }
  go(v){this.view=v;this.render()}
  shell(content,title=""){
    const nav=[["home","⌂","Home"],["planner","✓","Planner"],["calendar","▦","Calendar"],["progress","◔","Progress"],["more","•••","More"]];
    return `<main class="screen"><div class="top"><div><div class="brand">Taskora</div>${title?`<div class="tiny muted">${esc(title)}</div>`:""}</div><button class="iconbtn" data-action="premium" aria-label="Premium">✦</button></div>${content}</main><button class="fab" data-action="add" aria-label="Add">+</button><nav class="bottom">${nav.map(n=>`<button class="navbtn ${this.view===n[0]?"active":""}" data-action="nav" data-view="${n[0]}"><span class="navicon">${n[1]}</span>${n[2]}</button>`).join("")}</nav>`;
  }
  render(){this.applyTheme();const app=document.getElementById("app");let c="";if(this.view==="home")c=this.home();else if(this.view==="planner")c=this.planner();else if(this.view==="calendar")c=this.calendar();else if(this.view==="progress")c=this.progress();else c=this.more();app.innerHTML=this.shell(c);this.maybeInstallHint()}
  home(){
    const name=this.state.user.name||"there", tasks=this.state.tasks.filter(x=>!x.done).sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999")), urgent=tasks[0], exams=this.state.exams.filter(x=>daysUntil(x.date)>=0).sort((a,b)=>daysUntil(a.date)-daysUntil(b.date)), due=tasks.filter(x=>daysUntil(x.due)<=7).length;
    const q=this.questions();
    return `<section><div class="card hero"><div class="eyebrow">Today</div><h1>Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${esc(name)} 👋</h1><p class="muted">${due?`${due} task${due===1?"":"s"} need attention this week.`:"You're clear for now. Let's get ahead."}</p><div class="row wrap"><button class="btn secondary" data-action="ask" data-question="What should I do now?">What should I do now?</button><button class="btn secondary" data-action="rescue">Deadline Rescue</button></div></div>
      <div class="spacer"></div>${urgent?`<div class="card"><div class="row between"><div><div class="eyebrow">Next best action</div><h2>${esc(urgent.title)}</h2><p class="muted">${esc(urgent.course||"General")} · ${urgent.due?fmtDate(urgent.due):"No deadline"} · ~${urgent.minutes||30} min</p></div><span class="pill ${daysUntil(urgent.due)<=1?"danger":daysUntil(urgent.due)<=3?"warn":"ok"}">${urgent.due?daysUntil(urgent.due)<=0?"Due":"Due in "+daysUntil(urgent.due):"Open"}</span></div><button class="btn primary" data-action="focus" data-id="${urgent.id}">Start focus session</button></div>`:"<div class=\"card empty\"><div class=\"emoji\">🎯</div><h3>No tasks yet</h3><p class=\"muted\">Add a course or deadline and Taskora will start building your next steps.</p><button class=\"btn primary\" data-action=\"add\">Add your first task</button></div>"}
      <div class="spacer"></div><h2>What can I help with?</h2>${q.map(x=>`<button class="question" data-action="ask" data-question="${esc(x.q)}" data-context="${esc(x.c)}"><div class="tag">${esc(x.tag)}</div><strong>${esc(x.q)}</strong><div class="tiny muted" style="margin-top:5px">${esc(x.sub)}</div></button>`).join("")}
      <div class="spacer"></div><div class="grid"><div class="stat"><span class="muted tiny">Courses</span><strong>${this.state.courses.length}</strong></div><div class="stat"><span class="muted tiny">Upcoming exams</span><strong>${exams.length}</strong></div><div class="stat"><span class="muted tiny">Open tasks</span><strong>${tasks.length}</strong></div><div class="stat"><span class="muted tiny">AI today</span><strong>${this.aiUsed()}/${this.aiLimit()}</strong></div></div>
    </section>`;
  }
  questions(){
    const tasks=this.state.tasks.filter(x=>!x.done), exams=this.state.exams.filter(x=>daysUntil(x.date)>=0).sort((a,b)=>daysUntil(a.date)-daysUntil(b.date)), overdue=tasks.filter(x=>x.due&&daysUntil(x.due)<0), soon=tasks.filter(x=>x.due&&daysUntil(x.due)<=2);
    const out=[];
    if(exams[0]&&daysUntil(exams[0].date)<=7){out.push({tag:"EXAM MODE",q:"What should I revise first?",sub:`${exams[0].name} is in ${Math.max(0,daysUntil(exams[0].date))} day(s).`,c:"exam"});out.push({tag:"EXAM MODE",q:"Build my exam plan.",sub:"Turn the time left into a realistic revision plan.",c:"examplan"})}
    if(overdue.length){out.push({tag:"RECOVERY",q:"Help me catch up.",sub:`You have ${overdue.length} overdue task(s).`,c:"behind"})}
    else if(soon.length){out.push({tag:"DEADLINE",q:"What should I finish first?",sub:`${soon.length} task(s) are due within 48 hours.`,c:"deadline"})}
    else out.push({tag:"PLAN",q:"What should I study today?",sub:"Pick the best next step from your current workload.",c:"today"});
    if(this.state.tasks.length)out.push({tag:"FOCUS",q:"I have 30 minutes. What can I finish?",sub:"Find one useful task that fits.",c:"30min"});
    if(out.length<3)out.push({tag:"GET AHEAD",q:"How can I get ahead this week?",sub:"Use your current workload to make a head start.",c:"ahead"});
    return out.slice(0,5);
  }
  planner(){
    const open=this.state.tasks.filter(x=>!x.done).sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999")),done=this.state.tasks.filter(x=>x.done);
    return `<h1>Planner</h1><p class="muted">Keep everything in one place. Taskora handles the prioritization.</p><div class="row wrap"><button class="btn primary" data-action="add">+ Add</button><button class="btn secondary" data-action="rescue">Deadline Rescue</button></div><div class="spacer"></div><div class="card"><div class="row between"><h2>Open tasks</h2><span class="pill">${open.length}</span></div>${open.length?open.map(t=>this.taskHtml(t)).join(""):`<div class="empty"><div class="emoji">🗂️</div><p class="muted">No open tasks.</p></div>`}</div><div class="spacer"></div><div class="card"><div class="row between"><h2>Completed</h2><span class="pill ok">${done.length}</span></div>${done.slice(0,8).map(t=>this.taskHtml(t,true)).join("")||`<p class="muted tiny">Completed tasks appear here.</p>`}</div>`;
  }
  taskHtml(t,done=false){return `<div class="task"><button class="check ${done?"done":""}" data-action="complete" data-id="${t.id}" aria-label="Complete task">${done?"✓":""}</button><div class="taskmain" data-action="openTask" data-id="${t.id}"><div class="tasktitle" style="${done?"text-decoration:line-through;opacity:.65":""}">${esc(t.title)}</div><div class="taskmeta">${esc(t.course||"General")} · ${t.due?fmtDate(t.due):"No deadline"} · ${t.minutes||30} min</div></div></div>`}
  calendar(){
    const dates=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d.toISOString().slice(0,10)});
    return `<h1>Calendar</h1><p class="muted">Your next 7 days at a glance.</p>${dates.map(d=>{const ts=this.state.tasks.filter(t=>t.due===d&&!t.done), es=this.state.exams.filter(e=>e.date===d);return `<div class="card"><div class="row between"><div><div class="eyebrow">${new Intl.DateTimeFormat(undefined,{weekday:"long"}).format(new Date(d+"T12:00:00"))}</div><h3>${fmtDate(d)}</h3></div><span class="pill">${ts.length+es.length}</span></div>${es.map(e=>`<div class="task"><div class="pill danger">EXAM</div><div class="taskmain"><div class="tasktitle">${esc(e.name)}</div></div></div>`).join("")}${ts.map(t=>this.taskHtml(t)).join("")||(!es.length?`<p class="muted tiny">Nothing scheduled.</p>`:"")}</div>`}).join("")}`;
  }
  progress(){
    const total=this.state.tasks.length, done=this.state.tasks.filter(t=>t.done).length, pct=total?Math.round(done/total*100):0, mins=this.state.sessions.reduce((a,x)=>a+(x.minutes||0),0), courses=this.state.courses.map(c=>{const ts=this.state.tasks.filter(t=>t.course===c.name);const d=ts.filter(t=>t.done).length;return {...c,p:ts.length?Math.round(d/ts.length*100):0}});
    return `<h1>Progress</h1><p class="muted">See what is actually moving forward.</p><div class="grid"><div class="stat"><span class="muted tiny">Tasks</span><strong>${done}/${total}</strong></div><div class="stat"><span class="muted tiny">Completion</span><strong>${pct}%</strong></div><div class="stat"><span class="muted tiny">Focus time</span><strong>${Math.round(mins/60*10)/10}h</strong></div><div class="stat"><span class="muted tiny">Courses</span><strong>${this.state.courses.length}</strong></div></div><div class="spacer"></div><div class="card"><h2>Overall</h2><div class="progress"><i style="width:${pct}%"></i></div><p class="tiny muted" style="margin-top:8px">${done} completed of ${total} tasks.</p></div><div class="spacer"></div><div class="card"><h2>Courses</h2>${courses.map(c=>`<div style="margin:15px 0"><div class="row between"><strong>${esc(c.name)}</strong><span class="tiny muted">${c.p}%</span></div><div class="progress" style="margin-top:7px"><i style="width:${c.p}%"></i></div></div>`).join("")||`<p class="muted">Add courses to see course progress.</p>`}</div><div class="spacer"></div><div class="card"><h2>Weekly review</h2><p class="muted">Premium can turn your workload and study history into a personalized weekly review.</p><button class="btn primary" data-action="premium">Unlock Premium</button></div>`;
  }
  more(){
    const s=this.state.subscription.premium;
    return `<h1>More</h1><div class="card hero"><div class="eyebrow">Taskora Premium</div><h2>Make your workload adapt to you.</h2><p class="muted">Deadline Rescue, adaptive planning, exam mode and advanced AI.</p><button class="btn secondary" data-action="premium">${s?"Premium active":"Unlock for $2 / ₦2,000"}</button></div><div class="spacer"></div>${[
      ["Profile","Set your school and study preferences.","profile"],
      ["Notifications","Control reminders and FCM categories.","notifications"],
      ["Appearance",`Current: ${this.state.settings.theme}`,"theme"],
      ["Referral","Invite classmates and share Taskora.","referral"],
      ["Share Taskora","Share the app with a friend.","share"],
      ["AI usage",`${this.aiUsed()}/${this.aiLimit()} AI action(s) used today.`,"usage"],
      ["Help & Support","Troubleshooting and contact options.","help"],
      ["Privacy","What Taskora stores and sends to AI.","privacy"],
      ["Terms","Terms of use.","terms"],
      ["About","Taskora — academic workload autopilot.","about"],
      ["Clear local data","Delete this device's Taskora data.","clear"]
    ].map(x=>`<button class="question" data-action="${x[2]}"><strong>${x[0]}</strong><div class="tiny muted" style="margin-top:4px">${x[1]}</div></button>`).join("")}`;
  }
  aiUsed(){if(this.state.ai.day!==todayKey()){this.state.ai.day=todayKey();this.state.ai.used=0;this.save()}return this.state.ai.used}
  aiLimit(){return this.state.subscription.premium?30:3}
  canAI(){return this.aiUsed()<this.aiLimit()}
  async askCard(q,context){
    if(!this.canAI()){this.paywall("You've used today's AI allowance. Premium gives you up to 30 AI actions each day.");return}
    this.answerSheet(q); await this.ai(q,context);
  }
  answerSheet(q){
    this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><div class="eyebrow">Taskora AI</div><h2>${esc(q)}</h2><div id="airesult"><p class="muted"><span class="loading"></span> Looking at your current workload…</p></div>`);
  }
  async ai(q,context){
    const relevant={
      courses:this.state.courses,
      tasks:this.state.tasks.slice(0,50),
      exams:this.state.exams.slice(0,20),
      recentSessions:this.state.sessions.slice(-15),
      availableTimeMinutes:30,
      context
    };
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:q,context:relevant})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||"AI unavailable");
      this.state.ai.used++;this.state.ai.day=todayKey();this.state.ai.history.push({q,answer:data,at:Date.now()});this.state.ai.history=this.state.ai.history.slice(-30);this.save();
      const box=document.getElementById("airesult");if(box)box.innerHTML=this.aiHtml(data);
    }catch(e){
      const box=document.getElementById("airesult");if(box)box.innerHTML=`<div class="card"><h3>Couldn't reach Taskora AI</h3><p class="muted">${esc(e.message||"Check your connection and try again.")}</p><button class="btn secondary" data-action="close">Continue with my planner</button></div>`;
    }
  }
  aiHtml(d){
    const actions=Array.isArray(d.actions)?d.actions:[];
    const reason=d.reason?`<div class="card" style="background:var(--surface2);box-shadow:none"><div class="eyebrow">Why</div><p style="margin:6px 0 0">${esc(d.reason)}</p></div>`:"";
    const actionHtml=actions.map(a=>{
      const mins=a.minutes?`${esc(a.minutes)} min`:"";
      return `<div class="task"><div class="pill">${mins}</div><div class="taskmain"><div class="tasktitle">${esc(a.title||a.action||"Next step")}</div><div class="taskmeta">${esc(a.detail||"")}</div></div></div>`;
    }).join("");
    return `<div class="card"><h3>${esc(d.title||"Your next step")}</h3><p>${esc(d.summary||"Here is the most useful next move based on your current workload.")}</p>${reason}${actionHtml?`<div class="spacer"></div><div class="eyebrow">Actions</div>${actionHtml}`:""}<div class="spacer"></div><button class="btn primary" data-action="close">Got it</button></div>`;
  }
  askOther(){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>Ask Taskora</h2><p class="muted">Keep it academic and Taskora will use your actual workload when it can.</p><div class="field"><label>What do you need?</label><textarea id="otherq" class="textarea" maxlength="700" placeholder="e.g. I have 45 minutes tonight. What should I work on?"></textarea></div><button class="btn primary" data-action="askTyped">Ask Taskora</button>`);document.querySelector("[data-action='askTyped']")?.addEventListener("click",()=>{const q=document.getElementById("otherq")?.value.trim();if(q)this.askCard(q,"open")})}
  rescue(){this.askCard("I'm falling behind. Analyze my deadlines and build a realistic recovery plan.","behind")}
  addSheet(){
    this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>Add to Taskora</h2><div class="grid"><button class="btn secondary" data-action="newCourse">Course</button><button class="btn secondary" data-action="newTask">Assignment</button><button class="btn secondary" data-action="newExam">Exam</button><button class="btn secondary" data-action="newGoal">Goal</button></div>`);
    for(const [a,fn] of [["newCourse",()=>this.courseSheet()],["newTask",()=>this.taskSheet()],["newExam",()=>this.examSheet()],["newGoal",()=>this.goalSheet()]])document.querySelector(`[data-action="${a}"]`)?.addEventListener("click",fn);
  }
  courseSheet(){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>Add course</h2><div class="field"><label>Course name</label><input id="cname" class="input" maxlength="80" placeholder="BIO 201"></div><div class="field"><label>Instructor (optional)</label><input id="cinstructor" class="input" maxlength="80"></div><button class="btn primary" data-action="saveCourse">Save course</button>`)}
  saveCourse(){const n=document.getElementById("cname")?.value.trim();if(!n)return this.toast("Enter a course name.");this.state.courses.push({id:uid(),name:n,instructor:document.getElementById("cinstructor")?.value.trim()||""});this.save();this.closeOverlay();this.render();this.toast("Course added.")}
  taskSheet(id){
    const t=id?this.state.tasks.find(x=>x.id===id):null;
    const courses=this.state.courses.map(c=>`<option>${esc(c.name)}</option>`).join("");
    this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>${t?"Edit task":"Add assignment"}</h2><div class="field"><label>Task</label><input id="tname" class="input" maxlength="120" value="${esc(t?.title||"")}" placeholder="Finish Chapter 4 questions"></div><div class="field"><label>Course</label><select id="tcourse" class="input selectlike"><option value="">General</option>${courses}</select></div><div class="field"><label>Deadline</label><input id="tdue" class="input" type="date" value="${t?.due||""}"></div><div class="field"><label>Estimated minutes</label><input id="tmin" class="input" type="number" min="5" max="720" value="${t?.minutes||30}"></div><button class="btn primary" data-action="saveTask" data-edit="${t?.id||""}">Save task</button>${t?`<button class="btn danger" style="margin-top:8px;width:100%" data-action="deleteTask" data-id="${t.id}">Delete task</button>`:""}`);
    if(t&&document.getElementById("tcourse"))document.getElementById("tcourse").value=t.course||"";
  }
  saveTask(){const title=document.getElementById("tname")?.value.trim();if(!title)return this.toast("Give the task a title.");const b=document.querySelector("[data-action='saveTask']"),id=b?.dataset.edit;const obj={id:id||uid(),title,course:document.getElementById("tcourse")?.value||"",due:document.getElementById("tdue")?.value||"",minutes:clamp(Number(document.getElementById("tmin")?.value||30),5,720),done:id?!!this.state.tasks.find(x=>x.id===id)?.done:false};if(id){const i=this.state.tasks.findIndex(x=>x.id===id);if(i>=0)this.state.tasks[i]=obj}else this.state.tasks.push(obj);this.save();this.closeOverlay();this.render();this.toast("Task saved.")}
  examSheet(){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>Add exam</h2><div class="field"><label>Exam name</label><input id="ename" class="input" maxlength="100" placeholder="BIO 201 Final"></div><div class="field"><label>Date</label><input id="edate" class="input" type="date"></div><div class="field"><label>Course</label><input id="ecourse" class="input" maxlength="80" placeholder="BIO 201"></div><button class="btn primary" data-action="saveExam">Save exam</button>`)}
  saveExam(){const name=document.getElementById("ename")?.value.trim(),date=document.getElementById("edate")?.value;if(!name||!date)return this.toast("Add an exam name and date.");this.state.exams.push({id:uid(),name,date,course:document.getElementById("ecourse")?.value.trim()||""});this.save();this.closeOverlay();this.render();this.toast("Exam added.")}
  goalSheet(){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>Add goal</h2><div class="field"><label>Goal</label><input id="gname" class="input" maxlength="120" placeholder="Study 6 hours this week"></div><button class="btn primary" data-action="saveGoal">Save goal</button>`)}
  saveGoal(){const n=document.getElementById("gname")?.value.trim();if(!n)return this.toast("Enter a goal.");this.state.goals.push({id:uid(),name:n,done:false});this.save();this.closeOverlay();this.render();this.toast("Goal added.")}
  taskComplete(id){this.completeTask(id)}
  completeTask(id){const t=this.state.tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;if(t.done)this.state.sessions.push({id:uid(),minutes:0,taskId:id,at:Date.now()});this.save();this.render();this.toast(t.done?"Task completed.":"Task reopened.")}
  deleteTask(id){this.state.tasks=this.state.tasks.filter(x=>x.id!==id);this.save();this.closeOverlay();this.render();this.toast("Task deleted.")}
  taskSheetFor(id){this.taskSheet(id)}
  focus(id){const t=this.state.tasks.find(x=>x.id===id);if(!t)return;let sec=(t.minutes||25)*60;this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><div class="eyebrow">Focus mode</div><h2>${esc(t.title)}</h2><p class="muted">${esc(t.course||"General")}</p><div style="font-size:58px;font-weight:850;text-align:center;margin:25px 0" id="timer">${String(Math.floor(sec/60)).padStart(2,"0")}:00</div><button class="btn primary" style="width:100%" id="startTimer">Start</button>`);let timer=null;document.getElementById("startTimer")?.addEventListener("click",e=>{if(timer)return;e.target.textContent="Running…";timer=setInterval(()=>{sec--;const el=document.getElementById("timer");if(!el){clearInterval(timer);return}el.textContent=`${String(Math.floor(Math.max(sec,0)/60)).padStart(2,"0")}:${String(Math.max(sec,0)%60).padStart(2,"0")}`;if(sec<=0){clearInterval(timer);this.toast("Focus session complete 🎯");this.state.sessions.push({id:uid(),minutes:t.minutes||25,taskId:t.id,at:Date.now()});this.save();e.target.textContent="Done";}},1000)})}
  profileSheet(){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>Profile</h2><div class="field"><label>Name</label><input id="pname" class="input" value="${esc(this.state.user.name)}"></div><div class="field"><label>School</label><input id="pschool" class="input" value="${esc(this.state.user.school)}"></div><div class="field"><label>Program</label><input id="pprogram" class="input" value="${esc(this.state.user.program)}"></div><div class="field"><label>Level</label><input id="plevel" class="input" value="${esc(this.state.user.level)}"></div><button class="btn primary" data-action="saveProfile">Save</button>`)}
  infoSheet(title,text){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><button class="btn primary" data-action="close">Done</button>`)}
  saveProfile(){this.state.user={name:document.getElementById("pname")?.value.trim()||"",school:document.getElementById("pschool")?.value.trim()||"",program:document.getElementById("pprogram")?.value.trim()||"",level:document.getElementById("plevel")?.value.trim()||""};this.save();this.closeOverlay();this.render();this.toast("Profile updated.")}
  premiumSheet(msg=""){this.overlay(`<div class="handle"></div><button class="close" data-action="close">×</button><div class="eyebrow">TASKORA PREMIUM</div><h2>Your workload, under control.</h2><p class="muted">Unlock the features that make Taskora adapt to your real semester.</p>${msg?`<div class="card" style="background:var(--surface2);box-shadow:none"><strong>${esc(msg)}</strong></div>`:""}<div class="card" style="margin-top:12px"><div>✓ Adaptive planning</div><div>✓ Deadline Rescue</div><div>✓ Exam Mode</div><div>✓ 30 AI actions/day</div><div>✓ Unlimited courses & tasks</div><div>✓ Smart reminders</div><div>✓ No ads</div></div><h2 style="margin-top:16px">$2/month <span class="muted">·</span> ₦2,000/month</h2><p class="tiny muted">Connect your verified Flutterwave payment links here. Premium must be confirmed server-side by the existing LabGuru webhook/entitlement system.</p><button class="btn primary" style="width:100%" id="payIntl">Pay $2</button><button class="btn secondary" style="width:100%;margin-top:8px" id="payNaira">Pay ₦2,000</button>`);
    document.getElementById("payIntl")?.addEventListener("click",()=>this.paymentLink("international"));
    document.getElementById("payNaira")?.addEventListener("click",()=>this.paymentLink("nigeria"));
  }
  paymentLink(kind){
    const override=kind==="nigeria"?localStorage.getItem("taskora_payment_ngn"):localStorage.getItem("taskora_payment_usd");
    const fromConfig=kind==="nigeria"?this.paymentConfig?.nigeria?.checkoutUrl:this.paymentConfig?.international?.checkoutUrl;
    const url=override||fromConfig;
    if(!url){this.toast("Payment link not configured yet.");return}
    location.href=url;
  }
  paywall(msg){this.premiumSheet(msg)}
  changeTheme(){const next=this.state.settings.theme==="system"?"light":this.state.settings.theme==="light"?"dark":"system";this.state.settings.theme=next;this.save();this.applyTheme();this.render();this.toast(`Theme: ${next}`)}
  toggleNotifications(){this.state.settings.notifications=!this.state.settings.notifications;this.save();this.toast(this.state.settings.notifications?"Notifications enabled":"Notifications disabled")}
  share(){if(navigator.share)navigator.share({title:"Taskora",text:"Taskora helps students know what to study and what to do next.",url:location.origin}).catch(()=>{});else{navigator.clipboard?.writeText(location.origin);this.toast("Taskora link copied.")}}
  referral(){const code=this.state.referral.code||`TASK-${Math.random().toString(36).slice(2,8).toUpperCase()}`;this.state.referral.code=code;this.save();const text=`Try Taskora — an academic workload autopilot. Referral: ${code} ${location.origin}`;if(navigator.share)navigator.share({title:"Try Taskora",text}).catch(()=>{});else{navigator.clipboard?.writeText(text);this.toast("Referral text copied.")}}
  install(){if(this.installEvent){this.installEvent.prompt();this.installEvent.userChoice.finally(()=>this.installEvent=null)}else this.toast("Use your browser's Add to Home screen option.")}
  maybeInstallHint(){if(localStorage.getItem("taskora_install_dismissed")||!this.installEvent)return;if(!localStorage.getItem("taskora_install_hint")){localStorage.setItem("taskora_install_hint","1");setTimeout(()=>this.overlay(`<div class="handle"></div><h2>Make Taskora easier to reach</h2><p class="muted">Install it on your home screen for faster access and a better study experience.</p><button class="btn primary" data-action="install">Install</button><button class="btn secondary" style="margin-left:8px" data-action="dismissInstall">Not now</button>`),1200)}}
  clearData(){this.overlay(`<div class="handle"></div><h2>Clear this device?</h2><p class="muted">This removes Taskora's locally stored data from this device. It cannot be undone.</p><button class="btn danger" id="confirmClear">Clear data</button><button class="btn secondary" style="margin-left:8px" data-action="close">Cancel</button>`);document.getElementById("confirmClear")?.addEventListener("click",()=>{localStorage.removeItem(KEY);location.reload()})}
  overlay(html){const old=document.getElementById("overlay");old?.remove();const el=document.createElement("div");el.id="overlay";el.className="sheetback";el.innerHTML=`<div class="sheet">${html}</div>`;document.body.appendChild(el)}
  closeOverlay(){document.getElementById("overlay")?.remove()}
  renderOnboarding(){
    document.getElementById("app").innerHTML=`<main class="screen" style="padding-top:12vh"><div class="card hero"><div class="eyebrow">TASKORA</div><h1>Know what to study. Know what's next.</h1><p class="muted">A lightweight academic workload autopilot that turns deadlines and exams into practical next steps.</p><button class="btn secondary" id="startOnboard">Get started</button></div><div class="spacer"></div><div class="card"><h2>Built around your real workload</h2><p class="muted">Instead of asking you to invent prompts, Taskora surfaces the questions that matter right now.</p></div></main>`;
    document.getElementById("startOnboard").onclick=()=>this.onboardForm();
  }
  onboardForm(){
    document.getElementById("app").innerHTML=`<main class="screen"><div class="top"><div class="brand">Taskora</div><span class="pill">1 minute</span></div><div class="card"><div class="eyebrow">Quick setup</div><h1>Let's make it yours.</h1><p class="muted">You can change these later.</p><div class="field"><label>Name</label><input id="oname" class="input" maxlength="60" placeholder="Your name"></div><div class="field"><label>School (optional)</label><input id="oschool" class="input" maxlength="100"></div><div class="field"><label>Program / course (optional)</label><input id="oprogram" class="input" maxlength="100"></div><div class="field"><label>Level (optional)</label><input id="olevel" class="input" maxlength="50" placeholder="e.g. 200 level"></div><button class="btn primary" id="finishOnboard">Open Taskora</button></div></main>`;
    document.getElementById("finishOnboard").onclick=()=>{this.state.user={name:document.getElementById("oname").value.trim(),school:document.getElementById("oschool").value.trim(),program:document.getElementById("oprogram").value.trim(),level:document.getElementById("olevel").value.trim()};this.state.onboarding=true;this.save();this.render()};
  }
}
