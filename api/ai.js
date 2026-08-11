import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPlan } from "./ai-policy.js";

const FREE=Number(process.env.TASKORA_AI_DAILY_FREE||getPlan(false).dailyActions);
const PREMIUM=Number(process.env.TASKORA_AI_DAILY_PREMIUM||getPlan(true).dailyActions);

// This starter route deliberately keeps entitlement server-side in the API.
// For production, connect isPremium() to the existing LabGuru verified entitlement
// service/webhook storage. Never trust a browser/localStorage premium flag.
const buckets=new Map();

function cleanText(v,max=700){return typeof v==="string"?v.slice(0,max):""}
function key(req){return (req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"anonymous").toString().split(",")[0].trim()}
function usageAllowed(k,limit){
  const day=new Date().toISOString().slice(0,10), now=Date.now(), old=buckets.get(k);
  if(!old||old.day!==day){buckets.set(k,{day,count:0,reset:now+86400000});}
  const x=buckets.get(k);
  if(x.count>=limit)return false;
  x.count++; return true;
}
function isPremium(req){
  // TODO: Replace with your LabGuru webhook/verified entitlement lookup.
  // Never read a client-provided premium boolean here.
  return false;
}
function buildPrompt(question,ctx){
  const safe=JSON.stringify({
    courses:Array.isArray(ctx.courses)?ctx.courses.slice(0,20):[],
    tasks:Array.isArray(ctx.tasks)?ctx.tasks.slice(0,40):[],
    exams:Array.isArray(ctx.exams)?ctx.exams.slice(0,15):[],
    recentSessions:Array.isArray(ctx.recentSessions)?ctx.recentSessions.slice(-10):[],
    availableTimeMinutes:Number(ctx.availableTimeMinutes)||30,
    situation:cleanText(ctx.context,80)
  });
  return `You are Taskora, a practical academic workload coach. You are NOT a generic chatbot.
Answer the student's request using the supplied academic context. Do not invent deadlines, courses, grades or facts. If context is missing, say what assumption you made.
Prioritize realistic, actionable next steps. Do not overload the student.
Return ONLY valid JSON with this exact shape:
{"title":"short title","summary":"2-4 concise sentences","reason":"one short reason based on the context","actions":[{"title":"action","detail":"short detail","minutes":30}]}
No markdown. Keep summary under 450 characters. Max 4 actions.
Student question: ${cleanText(question)}
Context: ${safe}`;
}
function parseJSON(text){
  const s=String(text||"").trim().replace(/^```json/i,"").replace(/```$/,"").trim();
  const start=s.indexOf("{"), end=s.lastIndexOf("}");
  if(start<0||end<start)throw new Error("Invalid AI response");
  return JSON.parse(s.slice(start,end+1));
}
async function groq(prompt){
  if(!process.env.GROQ_API_KEY)throw new Error("Groq is not configured");
  const client=new Groq({apiKey:process.env.GROQ_API_KEY});
  const r=await client.chat.completions.create({
    model:process.env.TASKORA_AI_MODEL||"llama-3.1-8b-instant",
    messages:[{role:"system",content:"You return strict JSON only."},{role:"user",content:prompt}],
    temperature:.25,max_tokens:650
  });
  return parseJSON(r.choices?.[0]?.message?.content);
}
async function gemini(prompt){
  if(!process.env.GEMINI_API_KEY)throw new Error("Gemini is not configured");
  const client=new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model=client.getGenerativeModel({model:process.env.TASKORA_GEMINI_MODEL||"gemini-2.5-flash"});
  const r=await model.generateContent(prompt);
  return parseJSON(r.response.text());
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try{
    const question=cleanText(req.body?.question);
    const context=req.body?.context&&typeof req.body.context==="object"?req.body.context:{};
    if(!question)return res.status(400).json({error:"Question is required."});
    const premium=isPremium(req),limit=premium?PREMIUM:FREE,k=key(req);
    if(!usageAllowed(k,limit))return res.status(429).json({error:`Daily AI limit reached. ${premium?"Try again tomorrow.":`Premium includes up to ${PREMIUM} AI actions per day.`}`});
    const prompt=buildPrompt(question,context);
    let answer;
    try{answer=await groq(prompt)}catch{answer=await gemini(prompt)}
    return res.status(200).json(answer);
  }catch(e){
    console.error("Taskora AI error",e);
    return res.status(500).json({error:"Taskora AI is temporarily unavailable. Please try again."});
  }
}
